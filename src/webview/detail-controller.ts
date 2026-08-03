import type { NodeData, ZkError, ZnodeStat } from '../zk/zk-client';
import { formatData } from './json-utils';

export interface DetailPanelDeps {
  getNodeData(path: string): Promise<NodeData>;
  saveNodeData(path: string, data: Buffer, version: number): Promise<void>;
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
    return message;
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
    try {
      await this.deps.saveNodeData(message.path, Buffer.from(message.text, 'utf8'), this.loadedStat.version);
      this.view.postMessage({ type: 'saved', path: message.path } as SaveResultMessage);
      await this.load(message.path);
    } catch (err) {
      const zkError = err as Partial<ZkError>;
      this.view.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
        code: zkError.code,
      } as ErrorMessage);
    }
  }
}
