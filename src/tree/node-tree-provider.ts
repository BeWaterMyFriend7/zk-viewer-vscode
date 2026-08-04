import * as vscode from 'vscode';
import type { ZkClient } from '../zk/zk-client';
import { iconForType } from './node-model';
import { listChildDescriptors, type TreeSortOrder, type ZkNodeDescriptor } from './node-tree';

export class ZkNode extends vscode.TreeItem {
  constructor(readonly descriptor: ZkNodeDescriptor) {
    super(
      descriptor.name,
      descriptor.collapsibleState === 'none'
        ? vscode.TreeItemCollapsibleState.None
        : vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.contextValue = 'znode';
    this.iconPath = new vscode.ThemeIcon(iconForType(descriptor.type));
    this.tooltip = descriptor.path;
  }
}

export class NodeTreeProvider implements vscode.TreeDataProvider<ZkNode> {
  private readonly changeEmitter = new vscode.EventEmitter<ZkNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(private readonly getClient: () => ZkClient | undefined) {}

  getTreeItem(element: ZkNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ZkNode): Promise<ZkNode[]> {
    if (!element) {
      return [new ZkNode({ path: '/', name: '/', type: 'persistent', collapsibleState: 'collapsed' })];
    }
    const client = this.getClient();
    if (!client) {
      return [];
    }
    try {
      const sort = vscode.workspace.getConfiguration('zkViewer').get<TreeSortOrder>('treeSort') ?? 'name';
      const descriptors = await listChildDescriptors(client, element.descriptor.path, sort);
      return descriptors.map((descriptor) => new ZkNode(descriptor));
    } catch {
      return [];
    }
  }

  refresh(): void {
    this.changeEmitter.fire(undefined);
  }
}

export async function findNodeInTree(provider: NodeTreeProvider, path: string): Promise<ZkNode> {
  const segments = path.split('/').filter(Boolean);
  const roots = await provider.getChildren(undefined);
  const rootNode = roots.find((node) => node.descriptor.path === '/');
  if (!rootNode) {
    throw new Error(`Root node is not visible: ${path}`);
  }
  let current: ZkNode = rootNode;
  for (const segment of segments) {
    const children = await provider.getChildren(current);
    const next = children.find((node) => node.descriptor.name === segment);
    if (!next) {
      throw new Error(`Path not visible in tree: ${path}`);
    }
    current = next;
  }
  return current;
}

export async function revealPathInTree(
  treeView: vscode.TreeView<ZkNode>,
  provider: NodeTreeProvider,
  path: string,
): Promise<void> {
  const node = await findNodeInTree(provider, path);
  await treeView.reveal(node, { expand: true, focus: true, select: true });
}
