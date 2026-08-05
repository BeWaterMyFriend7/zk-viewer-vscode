import { ZkErrorCode, type NodeData, type ZkError, type ZkWatchEvent, type ZnodeStat } from '../zk/zk-client';
import { formatData } from './json-utils';

export interface DetailPanelDeps {
  getNodeData(path: string): Promise<NodeData>;
  saveNodeData(path: string, data: Buffer, version: number): Promise<void>;
  /** Optional pre-save existence check so a deleted node fails fast and clearly. */
  nodeExists?(path: string): Promise<boolean>;
  /** One-shot data watch; the controller re-arms it after non-deletion events. */
  watchNode?(path: string, onEvent: (event: ZkWatchEvent) => void): Promise<void>;
  /** Prominent error reporting, e.g. a VS Code notification. */
  notifyError?(message: string, code?: string): void;
  /** Called once when the watched node is deleted (close the panel, refresh the tree). */
  onNodeDeleted?(path: string): void;
}

export interface DetailView {
  postMessage(message: unknown): void;
}

export interface LoadDataMessage {
  type: 'loadData';
  path: string;
  stat: ZnodeStat;
  dataText: string;
  kind: 'json' | 'text' | 'binary';
  editable: boolean;
}

export interface SaveResultMessage {
  type: 'saved';
  path: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
  code?: string;
}

/**
 * vscode-free message protocol for the node detail panel. Unit tests drive the
 * same code path the Webview uses: loadData -> save -> saved/error.
 */
export class DetailPanelController {
  private loadedStat: ZnodeStat | undefined;
  private loadedPath: string | undefined;
  private watchArmed = false;
  private disposed = false;

  constructor(
    private readonly deps: DetailPanelDeps,
    private readonly view: DetailView,
  ) {}

  getLastLoad(): { path: string; stat: ZnodeStat } | undefined {
    return this.loadedPath && this.loadedStat ? { path: this.loadedPath, stat: this.loadedStat } : undefined;
  }

  async load(path: string): Promise<LoadDataMessage> {
    const { data, stat } = await this.deps.getNodeData(path);
    this.loadedPath = path;
    this.loadedStat = stat;
    const formatted = formatData(data);
    const message: LoadDataMessage = {
      type: 'loadData',
      path,
      stat,
      dataText: formatted.text,
      kind: formatted.kind,
      editable: formatted.kind !== 'binary',
    };
    this.view.postMessage(message);
    await this.armWatch(path);
    return message;
  }

  /**
   * Stops reacting to watcher callbacks. Safe to call when the panel is
   * closed; stale watcher events from the native client are then ignored.
   */
  dispose(): void {
    this.disposed = true;
    this.watchArmed = false;
  }

  private async armWatch(path: string): Promise<void> {
    if (this.disposed || !this.deps.watchNode) {
      return;
    }
    this.watchArmed = true;
    try {
      await this.deps.watchNode(path, (event) => this.handleWatchEvent(event));
    } catch (err) {
      if (!this.watchArmed) {
        // The watcher event already handled the situation.
        return;
      }
      this.watchArmed = false;
      const zkError = err as Partial<ZkError>;
      if (zkError.code === ZkErrorCode.NO_NODE) {
        this.handleNodeDeleted(path);
      }
    }
  }

  private handleWatchEvent(event: ZkWatchEvent): void {
    if (this.disposed || !this.watchArmed || event.path !== this.loadedPath) {
      return;
    }
    this.watchArmed = false;
    if (event.type === 'deleted') {
      this.handleNodeDeleted(event.path);
      return;
    }
    // Any other event (data changed elsewhere) keeps the loaded snapshot
    // stale but still worth watching, so re-arm to catch a later deletion.
    void this.armWatch(event.path);
  }

  private handleNodeDeleted(path: string): void {
    this.loadedPath = undefined;
    this.loadedStat = undefined;
    this.view.postMessage({
      type: 'error',
      message: `Node has been deleted: ${path}`,
      code: ZkErrorCode.NO_NODE,
    } as ErrorMessage);
    this.deps.notifyError?.(`节点已被删除，详情面板将关闭：${path}`, ZkErrorCode.NO_NODE);
    this.deps.onNodeDeleted?.(path);
  }

  async handleMessage(message: {
    type: string;
    path?: string;
    text?: string;
    version?: number;
  }): Promise<void> {
    if (message.type !== 'save') {
      return;
    }
    if (!message.path || message.text === undefined) {
      this.view.postMessage({
        type: 'error',
        message: 'Save message is missing path or data',
      } as ErrorMessage);
      return;
    }
    if (!this.loadedStat) {
      this.view.postMessage({ type: 'error', message: 'Node data has not been loaded yet' } as ErrorMessage);
      return;
    }
    if (this.deps.nodeExists) {
      let exists: boolean;
      try {
        exists = await this.deps.nodeExists(message.path);
      } catch (err) {
        this.postSaveError(err);
        return;
      }
      if (!exists) {
        this.view.postMessage({
          type: 'error',
          message: `Node does not exist: ${message.path}`,
          code: ZkErrorCode.NO_NODE,
        } as ErrorMessage);
        this.deps.notifyError?.('保存失败：节点已被删除，请刷新后重试', ZkErrorCode.NO_NODE);
        return;
      }
    }
    try {
      await this.deps.saveNodeData(message.path, Buffer.from(message.text, 'utf8'), this.loadedStat.version);
      this.view.postMessage({ type: 'saved', path: message.path } as SaveResultMessage);
      await this.load(message.path);
    } catch (err) {
      this.postSaveError(err);
    }
  }

  private postSaveError(err: unknown): void {
    const zkError = err as Partial<ZkError>;
    const errorMessage = err instanceof Error ? err.message : String(err);
    this.view.postMessage({
      type: 'error',
      message: errorMessage,
      code: zkError.code,
    } as ErrorMessage);
    let notification = `保存失败：${errorMessage}`;
    if (zkError.code === ZkErrorCode.NO_NODE) {
      notification = `保存失败：节点已被删除，请刷新后重试（${errorMessage}）`;
    } else if (zkError.code === ZkErrorCode.BAD_VERSION) {
      notification = `保存失败：节点版本已变化，请重新加载后重试（${errorMessage}）`;
    }
    this.deps.notifyError?.(notification, zkError.code);
  }
}
