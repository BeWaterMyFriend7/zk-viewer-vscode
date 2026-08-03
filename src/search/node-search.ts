import type { ZkClient } from '../zk/zk-client';

export type SearchMode = 'prefix' | 'wildcard' | 'regex' | 'content';

export interface SearchOptions {
  mode: SearchMode;
  query: string;
  subtree?: string;
  maxNodes?: number;
}

export interface SearchResult {
  path: string;
  name: string;
  matchedBy: 'name' | 'content';
}

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

export async function searchNodes(client: ZkClient, options: SearchOptions): Promise<SearchResult[]> {
  const maxNodes = options.maxNodes ?? 2000;
  const results: SearchResult[] = [];
  const root = options.subtree && options.subtree.trim() ? options.subtree.trim() : '/';
  const matcher =
    options.mode === 'prefix'
      ? (name: string) => name.startsWith(options.query)
      : options.mode === 'wildcard'
        ? (path: string) => globToRegex(options.query).test(path)
        : options.mode === 'regex'
          ? (path: string) => new RegExp(options.query).test(path)
          : () => false;

  const stack: string[] = [root];
  const visited = new Set<string>();

  while (stack.length > 0 && visited.size < maxNodes) {
    const path = stack.pop()!;
    if (visited.has(path)) {
      continue;
    }
    visited.add(path);
    const name = nameOf(path);
    if (name !== '/') {
      if (options.mode === 'content') {
        try {
          const { data } = await client.getData(path);
          if (data.toString('utf8').includes(options.query)) {
            results.push({ path, name, matchedBy: 'content' });
          }
        } catch {
          // skip nodes that cannot be read
        }
      } else if (matcher(options.mode === 'prefix' ? name : path)) {
        results.push({ path, name, matchedBy: 'name' });
      }
    }
    let children: string[] = [];
    try {
      children = await client.getChildren(path);
    } catch {
      continue;
    }
    const paths = children.map((child) => childPath(path, child));
    for (const child of [...paths].reverse()) {
      stack.push(child);
    }
  }

  return results.sort((a, b) => a.path.localeCompare(b.path));
}
