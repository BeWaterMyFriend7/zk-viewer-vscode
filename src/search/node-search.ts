import type { ZkClient } from '../zk/zk-client';
import { mapLimit } from '../utils/async';

export type SearchMode = 'prefix' | 'wildcard' | 'regex' | 'content';

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

export const SEARCH_DEFAULT_CONCURRENCY = 16;
export const SEARCH_DEFAULT_MAX_DATA_BYTES = 1024 * 1024;

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
export async function searchNodes(client: ZkClient, options: SearchOptions): Promise<SearchResult[]> {
  const maxNodes = options.maxNodes ?? 2000;
  const maxDataBytes = options.maxDataBytes ?? SEARCH_DEFAULT_MAX_DATA_BYTES;
  const concurrency = Math.min(Math.max(options.concurrency ?? SEARCH_DEFAULT_CONCURRENCY, 1), 64);
  const root = options.subtree && options.subtree.trim() ? options.subtree.trim() : '/';
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

  while (level.length > 0 && visited < maxNodes) {
    const allowed = level.slice(0, maxNodes - visited);
    if (allowed.length === 0) {
      break;
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

  return results.sort((a, b) => a.path.localeCompare(b.path));
}
