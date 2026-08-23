import type { ZkClient } from '../zk/zk-client';

export type ExportDataEncoding = 'utf8' | 'base64';

export interface ExportedNodeData {
  path: string;
  data: string;
  encoding: ExportDataEncoding;
}

export interface NodeDataExport {
  format: 'zk-viewer-node-data';
  version: 1;
  rootPath: string;
  recursive: boolean;
  nodes: ExportedNodeData[];
}

function childPath(parent: string, name: string): string {
  return parent === '/' ? `/${name}` : `${parent}/${name}`;
}

function encodeData(data: Buffer): Pick<ExportedNodeData, 'data' | 'encoding'> {
  const text = data.toString('utf8');
  if (!data.includes(0) && Buffer.from(text, 'utf8').equals(data)) {
    return { data: text, encoding: 'utf8' };
  }
  return { data: data.toString('base64'), encoding: 'base64' };
}

/**
 * Collects a stable, lossless export. The iterative traversal supports deep
 * ZooKeeper trees without consuming the JavaScript call stack.
 */
export async function collectNodeDataExport(
  client: ZkClient,
  rootPath: string,
  recursive: boolean,
): Promise<NodeDataExport> {
  const nodes: ExportedNodeData[] = [];
  const pending = [rootPath];

  while (pending.length > 0) {
    const path = pending.pop()!;
    const { data } = await client.getData(path);
    nodes.push({ path, ...encodeData(data) });

    if (!recursive) {
      continue;
    }
    const children = (await client.getChildren(path)).sort((left, right) => left.localeCompare(right));
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push(childPath(path, children[index]));
    }
  }

  return {
    format: 'zk-viewer-node-data',
    version: 1,
    rootPath,
    recursive,
    nodes,
  };
}

export function serializeNodeDataExport(exported: NodeDataExport): string {
  return `${JSON.stringify(exported, null, 2)}\n`;
}
