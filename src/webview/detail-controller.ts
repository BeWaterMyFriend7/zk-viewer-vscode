import { ZkErrorCode, type NodeData, type ZkError, type ZkWatchEvent, type ZnodeStat } from '../zk/zk-client';
import { getImportExportMessages, type DetailMessages } from '../i18n/import-export-messages';
import { compactJson, formatData } from './json-utils';

export interface DetailPanelDeps {
  messages?: DetailMessages;
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
  displayText: string;
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
  private messages: DetailMessages;

  constructor(
    private readonly deps: DetailPanelDeps,
    private readonly view: DetailView,
  ) {
    this.messages = deps.messages ?? getImportExportMessages('en').detail;
  }

  setMessages(messages: DetailMessages): void {
    this.messages = messages;
  }

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
      dataText: formatted.kind === 'binary' ? formatted.text : data.toString('utf8'),
      displayText: formatted.text,
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
      message: this.messages.deletedMessage(path),
      code: ZkErrorCode.NO_NODE,
    } as ErrorMessage);
    this.deps.notifyError?.(this.messages.deletedNotification(path), ZkErrorCode.NO_NODE);
    this.deps.onNodeDeleted?.(path);
  }

  async handleMessage(message: {
    type: string;
    path?: string;
    text?: string;
    version?: number;
    displayMode?: 'json' | 'text';
  }): Promise<void> {
    if (message.type !== 'save') {
      return;
    }
    if (!message.path || message.text === undefined) {
      this.view.postMessage({
        type: 'error',
        message: this.messages.saveMessageMissing,
      } as ErrorMessage);
      return;
    }
    if (!this.loadedStat) {
      this.view.postMessage({ type: 'error', message: this.messages.dataNotLoaded } as ErrorMessage);
      return;
    }
    let saveText = message.text;
    if (message.displayMode === 'json') {
      try {
        saveText = compactJson(saveText);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        this.view.postMessage({
          type: 'error',
          message: this.messages.invalidJson(detail),
        } as ErrorMessage);
        return;
      }
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
          message: this.messages.nodeDoesNotExist(message.path),
          code: ZkErrorCode.NO_NODE,
        } as ErrorMessage);
        this.deps.notifyError?.(this.messages.saveDeleted, ZkErrorCode.NO_NODE);
        return;
      }
    }
    try {
      await this.deps.saveNodeData(message.path, Buffer.from(saveText, 'utf8'), this.loadedStat.version);
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
    let notification = this.messages.saveFailed(errorMessage);
    if (zkError.code === ZkErrorCode.NO_NODE) {
      notification = this.messages.saveDeletedWithDetail(errorMessage);
    } else if (zkError.code === ZkErrorCode.BAD_VERSION) {
      notification = this.messages.saveVersionConflict(errorMessage);
    }
    this.deps.notifyError?.(notification, zkError.code);
  }
}
