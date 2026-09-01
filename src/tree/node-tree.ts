import type { ZkClient } from '../zk/zk-client';
import { mapLimit } from '../utils/async';
import { detectNodeType, type NodeType } from './node-model';

export interface ZkNodeDescriptor {
  path: string;
  name: string;
  type: NodeType;
  collapsibleState: 'none' | 'collapsed';
  /** True when the node has no children (a leaf), used for the tree icon. */
  isLeaf: boolean;
  stat?: ZkNodeTimes;
}

export interface ZkNodeTimes {
  ctime: string;
  mtime: string;
}

export type TreeSortOrder = 'name' | 'name-desc' | 'ctime' | 'ctime-desc' | 'mtime' | 'mtime-desc' | 'none';

export const TREE_SORT_ORDERS: ReadonlyArray<{ value: TreeSortOrder; label: string }> = [
  { value: 'name', label: 'Name (A → Z)' },
  { value: 'name-desc', label: 'Name (Z → A)' },
  { value: 'ctime', label: 'Created (oldest first)' },
  { value: 'ctime-desc', label: 'Created (newest first)' },
  { value: 'mtime', label: 'Modified (oldest first)' },
  { value: 'mtime-desc', label: 'Modified (newest first)' },
  { value: 'none', label: 'Server order' },
];

export const TREE_GETSTAT_CONCURRENCY = 32;

function joinPath(parent: string, name: string): string {
  return parent === '/' ? `/${name}` : `${parent}/${name}`;
}

export function sortDescriptors(descriptors: ZkNodeDescriptor[], order: TreeSortOrder): ZkNodeDescriptor[] {
  if (order === 'none') {
    return descriptors;
  }
  const descending = order.endsWith('-desc');
  const key = order.replace('-desc', '') as 'name' | 'ctime' | 'mtime';
  const factor = descending ? -1 : 1;
  return [...descriptors].sort((a, b) => {
    if (key === 'name') {
      return a.name.localeCompare(b.name) * factor;
    }
    const aTime = a.stat?.[key] ?? '';
    const bTime = b.stat?.[key] ?? '';
    return aTime.localeCompare(bTime) * factor;
  });
}

/**
 * Pure path-based parent derivation (no network access). Kept outside the
 * vscode-dependent provider so it is unit-testable without the extension host.
 */
export function getParentDescriptor(element: ZkNodeDescriptor): ZkNodeDescriptor | undefined {
  const path = element.path;
  if (path === '/') {
    return undefined;
  }
  const idx = path.lastIndexOf('/');
  const parentPath = idx === 0 ? '/' : path.slice(0, idx);
  const parentName = parentPath === '/' ? '/' : parentPath.slice(parentPath.lastIndexOf('/') + 1);
  // The parent is reconstructed without a network stat call, so its leaf-ness
  // cannot be known here; treat it as non-leaf (folder) which is the common
  // case and avoids a misleading file icon for an expandable node.
  return {
    path: parentPath,
    name: parentName,
    type: 'persistent',
    collapsibleState: 'collapsed',
    isLeaf: false,
  };
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
      let times: ZkNodeTimes | undefined;
      let isLeaf = true;
      try {
        const stat = await client.getStat(childPath);
        type = stat ? detectNodeType(stat, name) : 'persistent';
        times = stat ? { ctime: stat.ctime, mtime: stat.mtime } : undefined;
        isLeaf = stat ? stat.numChildren === 0 : true;
      } catch {
        type = 'persistent';
      }
      return {
        path: childPath,
        name,
        type,
        collapsibleState: 'collapsed',
        isLeaf,
        stat: times,
      };
    },
  );
  return sortDescriptors(descriptors, sort);
}
