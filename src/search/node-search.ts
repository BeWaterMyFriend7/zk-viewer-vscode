import type { ZkClient } from '../zk/zk-client';
import { mapLimit } from '../utils/async';
import { normalizePath } from './path-resolver';

export type SearchMode = 'exact' | 'prefix' | 'wildcard' | 'regex' | 'content';

export interface SearchOptions {
  mode: SearchMode;
  query: string;
  subtree?: string;
  maxNodes?: number;
  maxDataBytes?: number;
  concurrency?: number;
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
export const SEARCH_DEFAULT_MAX_DATA_BYTES = 1024 * 1024;
export const SEARCH_DEFAULT_MAX_NODES = 50000;

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
        };
      }
    } catch {
      // invalid path (e.g. missing leading slash); falls through to empty
    }
    return { results: [], truncated: false, visitedNodes: 0, maxNodes };
  }

  const matcher =
    options.mode === 'prefix'
      ? (name: string) => name.startsWith(options.query)
      : options.mode === 'wildcard'
        ? (path: string) => globToRegex(options.query).test(path)
        : options.mode === 'regex'
          ? (path: string) => new RegExp(options.query).test(path)
          : () => false;

  const results: SearchResult[] = [];
  let visited = 1;
  let level: string[] = [root];
  let truncated = false;

  while (level.length > 0 && visited < maxNodes) {
    const allowed = level.slice(0, maxNodes - visited);
    if (allowed.length === 0) {
      break;
    }
    if (allowed.length < level.length) {
      // The budget ran out mid-level; the rest of this level (and its
      // descendants) is skipped, so the outcome must be marked incomplete.
      truncated = true;
    }
    const nextLevel: string[] = [];
    const childLists = await mapLimit(allowed, concurrency, async (path) => {
      const name = nameOf(path);
      if (name !== '/') {
        if (options.mode === 'content') {
          try {
            const stat = await client.getStat(path);
            if (stat && stat.dataLength > 0 && stat.dataLength <= maxDataBytes) {
              const { data } = await client.getData(path);
              if (data.toString('utf8').includes(options.query)) {
                results.push({ path, name, matchedBy: 'content' });
              }
            }
          } catch {
            // node disappeared or is unreadable; skip
          }
        } else if (matcher(options.mode === 'prefix' ? name : path)) {
          results.push({ path, name, matchedBy: 'name' });
        }
      }
      try {
        return (await client.getChildren(path)).map((child) => childPath(path, child));
      } catch {
        return [];
      }
    });
    for (const children of childLists) {
      nextLevel.push(...children);
    }
    visited += allowed.length;
    level = nextLevel;
  }
  if (visited >= maxNodes && level.length > 0) {
    truncated = true;
  }

  return {
    results: results.sort((a, b) => a.path.localeCompare(b.path)),
    truncated,
    visitedNodes: visited,
    maxNodes,
  };
}
