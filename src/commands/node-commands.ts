import type { ZkClient } from '../zk/zk-client';

export function validateNodeName(name: string): string | undefined {
  if (name.length === 0) {
    return 'Node name must not be empty';
  }
  if (name.includes('/')) {
    return 'Node name must not contain "/"';
  }
  if (name === '.' || name === '..') {
    return 'Node name must not be "." or ".."';
  }
  return undefined;
}

function joinPath(parent: string, name: string): string {
  return parent === '/' ? `/${name}` : `${parent}/${name}`;
}

/**
 * Removes a subtree leaf-first. Uses an explicit stack so deep trees do not
 * overflow the call stack.
 */
export async function deleteNodeRecursively(client: ZkClient, path: string): Promise<void> {
  const stack: Array<{ path: string; expanded: boolean }> = [{ path, expanded: false }];
  while (stack.length > 0) {
    const item = stack[stack.length - 1];
    if (item.expanded) {
      stack.pop();
      await client.remove(item.path);
      continue;
    }
    item.expanded = true;
    const children = await client.getChildren(item.path);
    for (const child of children) {
      stack.push({ path: joinPath(item.path, child), expanded: false });
    }
  }
}
