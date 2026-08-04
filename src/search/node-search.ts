import type { ZkClient } from '../zk/zk-client';
import { mapLimit, walkTree } from '../utils/async';
import { normalizePath } from './path-resolver';

export type SearchMode = 'exact' | 'prefix' | 'wildcard' | 'regex' | 'content';

export interface SearchOptions {
  mode: SearchMode;
  query: string;
  subtree?: string;
  /** 0 or negative means unlimited. */
  maxNodes?: number;
  /** 0 or negative means no size filter (complete results). */
  maxDataBytes?: number;
  concurrency?: number;
  isCancelled?: () => boolean;
}

export interface SearchResult {
  path: string;
  name: string;
  matchedBy: 'name' | 'content';
}

export interface SearchOutcome {
  results: SearchResult[];
  /** True when the traversal hit maxNodes and results may be incomplete. */
  truncated: boolean;
  visitedNodes: number;
  maxNodes: number;
  /** Nodes skipped because they exceeded maxDataBytes (content mode only). */
  oversizedSkipped: number;
  /** True when the search was cancelled by the user. */
  cancelled: boolean;
}

/**
 * Guards command arguments: VS Code passes the TreeView as the first argument
 * to view/title commands, which must not be mistaken for explicit options.
 */
export function isSearchOptions(value: unknown): value is SearchOptions {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.mode === 'string' && typeof candidate.query === 'string';
}

export const SEARCH_DEFAULT_CONCURRENCY = 16;
export const SEARCH_DEFAULT_MAX_DATA_BYTES = 0; // 0 = no size filter, results stay complete
export const SEARCH_DEFAULT_MAX_NODES = 500000;

function globToRegex(pattern: string): RegExp {
  let out = '^';
  for (const char of pattern) {
    if (char === '*') {
      out += '[^/]*';
    } else if (char === '?') {
      out += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(char)) {
      out += '\\' + char;
    } else {
      out += char;
    }
  }
  out += '$';
  return new RegExp(out);
}

function nameOf(path: string): string {
  return path === '/' ? '/' : path.slice(path.lastIndexOf('/') + 1);
}

function childPath(parent: string, name: string): string {
  return parent === '/' ? `/${name}` : `${parent}/${name}`;
}

/**
 * Searches a znode tree with level-parallel traversal:
 * - nodes on the same level are requested concurrently (bounded by
 *   `concurrency`), so latency scales with depth, not node count;
 * - name/path modes never read node data;
 * - content mode pre-checks `stat.dataLength` and skips empty nodes and
 *   nodes larger than `maxDataBytes` to avoid downloading big payloads.
 */
export async function searchNodes(client: ZkClient, options: SearchOptions): Promise<SearchOutcome> {
  const maxNodes = options.maxNodes ?? SEARCH_DEFAULT_MAX_NODES;
  const maxDataBytes = options.maxDataBytes ?? SEARCH_DEFAULT_MAX_DATA_BYTES;
  const concurrency = Math.min(Math.max(options.concurrency ?? SEARCH_DEFAULT_CONCURRENCY, 1), 64);
  const root = options.subtree && options.subtree.trim() ? options.subtree.trim() : '/';

  // Exact path mode is a direct lookup: normalize the input, check existence
  // and return at most one result without traversing the tree.
  if (options.mode === 'exact') {
    try {
      const target = normalizePath(options.query);
      if (await client.exists(target)) {
        return {
          results: [{ path: target, name: nameOf(target), matchedBy: 'name' }],
          truncated: false,
          visitedNodes: 1,
          maxNodes,
          oversizedSkipped: 0,
          cancelled: false,
        };
      }
    } catch {
      // invalid path (e.g. missing leading slash); falls through to empty
    }
    return {
      results: [],
      truncated: false,
      visitedNodes: 0,
      maxNodes,
      oversizedSkipped: 0,
      cancelled: false,
    };
  }

  const matcher =
    options.mode === 'prefix'
      ? (name: string) => name.startsWith(options.query)
      : options.mode === 'wildcard'
        ? (path: string) => globToRegex(options.query).test(path)
        : options.mode === 'regex'
          ? (path: string) => new RegExp(options.query).test(path)
          : () => false;

  const walkOpts = {
    concurrency,
    maxItems: maxNodes,
    isCancelled: options.isCancelled,
  };

  if (options.mode === 'content') {
    // Phase 1: walk with stat pre-checks. Nodes that are empty or too large
    // are skipped without downloading their payload; oversized ones are
    // counted so the UI can explain why results may be lighter.
    const candidates: string[] = [];
    let oversizedSkipped = 0;
    const walkOutcome = await walkTree(
      root,
      async (path) => {
        const name = nameOf(path);
        if (name !== '/') {
          try {
            const stat = await client.getStat(path);
            if (stat && stat.dataLength > 0) {
              if (maxDataBytes > 0 && stat.dataLength > maxDataBytes) {
                oversizedSkipped += 1;
              } else {
                candidates.push(path);
              }
            }
          } catch {
            // node disappeared or is unreadable; skip
          }
        }
        try {
          return (await client.getChildren(path)).map((child) => childPath(path, child));
        } catch {
          return [];
        }
      },
      walkOpts,
    );
    // Phase 2: download candidate payloads with a smaller concurrency window
    // (data transfers are heavier than stat lookups).
    const downloadConcurrency = Math.max(2, Math.min(8, Math.ceil(concurrency / 2)));
    const hits = await mapLimit(candidates, downloadConcurrency, async (path) => {
      const name = nameOf(path);
      try {
        const { data } = await client.getData(path);
        if (data.toString('utf8').includes(options.query)) {
          const hit: SearchResult = { path, name, matchedBy: 'content' };
          return hit;
        }
      } catch {
        // node disappeared between stat and data; skip
      }
      return undefined as SearchResult | undefined;
    });
    return {
      results: hits
        .filter((hit): hit is SearchResult => hit !== undefined)
        .sort((a, b) => a.path.localeCompare(b.path)),
      truncated: walkOutcome.truncated,
      visitedNodes: walkOutcome.visited,
      maxNodes,
      oversizedSkipped,
      cancelled: walkOutcome.cancelled,
    };
  }

  const results: SearchResult[] = [];
  const walkOutcome = await walkTree(
    root,
    async (path) => {
      const name = nameOf(path);
      if (name !== '/') {
        if (matcher(options.mode === 'prefix' ? name : path)) {
          results.push({ path, name, matchedBy: 'name' });
        }
      }
      try {
        return (await client.getChildren(path)).map((child) => childPath(path, child));
      } catch {
        return [];
      }
    },
    walkOpts,
  );

  return {
    results: results.sort((a, b) => a.path.localeCompare(b.path)),
    truncated: walkOutcome.truncated,
    visitedNodes: walkOutcome.visited,
    maxNodes,
    oversizedSkipped: 0,
    cancelled: walkOutcome.cancelled,
  };
}
