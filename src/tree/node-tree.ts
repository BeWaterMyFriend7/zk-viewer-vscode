import type { ZkClient } from '../zk/zk-client';
import { mapLimit } from '../utils/async';
import { detectNodeType, type NodeType } from './node-model';

export interface ZkNodeDescriptor {
  path: string;
  name: string;
  type: NodeType;
  collapsibleState: 'none' | 'collapsed';
}

export type TreeSortOrder = 'name' | 'name-desc' | 'none';

export const TREE_GETSTAT_CONCURRENCY = 32;

function joinPath(parent: string, name: string): string {
  return parent === '/' ? `/${name}` : `${parent}/${name}`;
}

export function sortDescriptors(descriptors: ZkNodeDescriptor[], order: TreeSortOrder): ZkNodeDescriptor[] {
  if (order === 'none') {
    return descriptors;
  }
  const factor = order === 'name-desc' ? -1 : 1;
  return [...descriptors].sort((a, b) => a.name.localeCompare(b.name) * factor);
}

/**
 * Fetches one level of children and their node types. Callers only invoke this
 * when a node is expanded, which keeps large trees lazy-loading. Type lookups
 * are performed concurrently so a wide level does not serialize into many
 * round trips.
 */
export async function listChildDescriptors(
  client: ZkClient,
  path: string,
  sort: TreeSortOrder = 'name',
): Promise<ZkNodeDescriptor[]> {
  const names = await client.getChildren(path);
  const descriptors = await mapLimit<string, ZkNodeDescriptor>(
    names,
    TREE_GETSTAT_CONCURRENCY,
    async (name) => {
      const childPath = joinPath(path, name);
      let type: NodeType = 'persistent';
      try {
        const stat = await client.getStat(childPath);
        type = stat ? detectNodeType(stat, name) : 'persistent';
      } catch {
        type = 'persistent';
      }
      return { path: childPath, name, type, collapsibleState: 'collapsed' };
    },
  );
  return sortDescriptors(descriptors, sort);
}
