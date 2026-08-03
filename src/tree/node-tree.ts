import type { ZkClient } from '../zk/zk-client';
import { detectNodeType, type NodeType } from './node-model';

export interface ZkNodeDescriptor {
  path: string;
  name: string;
  type: NodeType;
  collapsibleState: 'none' | 'collapsed';
}

function joinPath(parent: string, name: string): string {
  return parent === '/' ? `/${name}` : `${parent}/${name}`;
}

/**
 * Fetches one level of children and their node types. Callers only invoke this
 * when a node is expanded, which keeps large trees lazy-loading.
 */
export async function listChildDescriptors(client: ZkClient, path: string): Promise<ZkNodeDescriptor[]> {
  const names = await client.getChildren(path);
  const descriptors: ZkNodeDescriptor[] = [];
  for (const name of names) {
    const childPath = joinPath(path, name);
    let type: NodeType = 'persistent';
    try {
      const stat = await client.getStat(childPath);
      type = stat ? detectNodeType(stat, name) : 'persistent';
    } catch {
      type = 'persistent';
    }
    descriptors.push({ path: childPath, name, type, collapsibleState: 'collapsed' });
  }
  return descriptors;
}
