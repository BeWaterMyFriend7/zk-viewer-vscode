import type { ZkClient } from '../zk/zk-client';

export type ImportConflictPolicy = 'overwrite' | 'skip';

export interface ImportedNodeData {
  path: string;
  data: Buffer;
}

export interface NodeDataImport {
  rootPath: string;
  nodes: ImportedNodeData[];
}

export interface NodeDataImportResult {
  created: number;
  updated: number;
  skipped: number;
}

const DOCUMENT_FIELDS = new Set(['format', 'version', 'rootPath', 'recursive', 'nodes']);
const NODE_FIELDS = new Set(['path', 'data', 'encoding']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyFields(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isNormalizedPath(path: string): boolean {
  return (
    path === '/' ||
    (path.startsWith('/') &&
      !path.endsWith('/') &&
      !path.includes('//') &&
      path
        .split('/')
        .slice(1)
        .every((segment) => segment.length > 0 && segment !== '.' && segment !== '..'))
  );
}

function isCanonicalBase64(value: string): boolean {
  return (
    value.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  );
}

export function parseNodeDataImport(text: string): NodeDataImport {
  const value: unknown = JSON.parse(text);
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, DOCUMENT_FIELDS) ||
    value.format !== 'zk-viewer-node-data' ||
    value.version !== 1 ||
    typeof value.rootPath !== 'string' ||
    !isNormalizedPath(value.rootPath) ||
    typeof value.recursive !== 'boolean' ||
    !Array.isArray(value.nodes)
  ) {
    throw new Error('Invalid ZooKeeper node data export document');
  }

  if (value.nodes.length === 0) {
    throw new Error('Import document does not contain any nodes');
  }
  const seenPaths = new Set<string>();
  const nodes = value.nodes.map((node): ImportedNodeData => {
    if (
      !isRecord(node) ||
      !hasOnlyFields(node, NODE_FIELDS) ||
      typeof node.path !== 'string' ||
      !isNormalizedPath(node.path) ||
      typeof node.data !== 'string' ||
      (node.encoding !== 'utf8' && node.encoding !== 'base64')
    ) {
      throw new Error('Invalid node entry in import document');
    }
    if (
      (value.rootPath !== '/' &&
        node.path !== value.rootPath &&
        !node.path.startsWith(`${value.rootPath}/`)) ||
      seenPaths.has(node.path)
    ) {
      throw new Error(`Invalid or duplicate node path: ${node.path}`);
    }
    if (node.encoding === 'base64' && !isCanonicalBase64(node.data)) {
      throw new Error(`Invalid Base64 data for node: ${node.path}`);
    }
    seenPaths.add(node.path);
    return {
      path: node.path,
      data: Buffer.from(node.data, node.encoding),
    };
  });
  if (!seenPaths.has(value.rootPath)) {
    throw new Error(`Import document does not contain its root node: ${value.rootPath}`);
  }
  if (!value.recursive && nodes.length !== 1) {
    throw new Error('A non-recursive import document must contain only its root node');
  }

  return { rootPath: value.rootPath, nodes };
}

function pathDepth(path: string): number {
  return path.split('/').filter(Boolean).length;
}

function parentPath(path: string): string | undefined {
  if (path === '/') {
    return undefined;
  }
  const separator = path.lastIndexOf('/');
  return separator === 0 ? '/' : path.slice(0, separator);
}

export async function importNodeData(
  client: ZkClient,
  document: NodeDataImport,
  conflictPolicy: ImportConflictPolicy,
): Promise<NodeDataImportResult> {
  const result: NodeDataImportResult = { created: 0, updated: 0, skipped: 0 };
  const nodes = [...document.nodes].sort(
    (left, right) => pathDepth(left.path) - pathDepth(right.path) || left.path.localeCompare(right.path),
  );
  const importedPaths = new Set(nodes.map((node) => node.path));
  const externalParents = new Set(
    nodes
      .map((node) => parentPath(node.path))
      .filter((parent): parent is string => parent !== undefined && !importedPaths.has(parent)),
  );
  for (const parent of externalParents) {
    if (!(await client.exists(parent))) {
      throw new Error(`Parent node does not exist: ${parent}`);
    }
  }

  for (const node of nodes) {
    const stat = await client.getStat(node.path);
    if (stat) {
      if (conflictPolicy === 'skip') {
        result.skipped += 1;
        continue;
      }
      await client.setData(node.path, node.data, stat.version);
      result.updated += 1;
    } else {
      await client.create(node.path, node.data, 'PERSISTENT');
      result.created += 1;
    }
  }

  return result;
}
