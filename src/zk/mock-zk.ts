import {
  ZkError,
  ZkErrorCode,
  type CreateMode,
  type NodeData,
  type ZkClient,
  type ZkConnectionState,
  type ZkWatchEvent,
  type ZkWatchEventType,
  type ZnodeStat,
} from './zk-client';

interface MockNode {
  data: Buffer;
  stat: ZnodeStat;
  children: Map<string, MockNode>;
  ephemeral: boolean;
  sequential: boolean;
}

export interface MockZkClientOptions {
  username?: string;
  password?: string;
  failConnect?: boolean;
  connectError?: Error;
  /** Deterministic clock for stat timestamps; default is a monotonic counter. */
  timeSource?: () => string;
}

function normalizePath(path: string): string {
  if (path === '/') {
    return '/';
  }
  if (!path.startsWith('/') || path.endsWith('/')) {
    throw new ZkError(`Invalid path: ${path}`);
  }
  return path;
}

function parentOf(path: string): { parent: string; name: string } {
  const normalized = normalizePath(path);
  const idx = normalized.lastIndexOf('/');
  if (idx === 0) {
    return { parent: '/', name: normalized.slice(1) };
  }
  return { parent: normalized.slice(0, idx), name: normalized.slice(idx + 1) };
}

function statForNode(data: Buffer, ephemeralOwner: string, numChildren: number, time: string): ZnodeStat {
  return {
    czxid: '0x1',
    mzxid: '0x1',
    pzxid: '0x1',
    ctime: time,
    mtime: time,
    version: 0,
    cversion: 0,
    aversion: 0,
    ephemeralOwner,
    dataLength: data.length,
    numChildren,
  };
}

export class MockZkClient implements ZkClient {
  private readonly nodes = new Map<string, MockNode>();
  private readonly stateListeners = new Set<(state: ZkConnectionState) => void>();
  private currentState: ZkConnectionState = 'closed';
  private sequenceCounter = 0;
  private clockCounter = 0;
  private readonly baseTime: number;
  private readonly timeSource: () => string;
  closeCalls = 0;
  readonly childrenRequestLog: string[] = [];
  readonly removalLog: string[] = [];
  private readonly dataWatchers = new Map<string, (event: ZkWatchEvent) => void>();

  constructor(private readonly opts: MockZkClientOptions = {}) {
    this.baseTime = Date.now();
    this.timeSource =
      opts.timeSource ?? (() => new Date(this.baseTime + this.clockCounter++ * 1000).toISOString());
    this.nodes.set('/', {
      data: Buffer.alloc(0),
      stat: statForNode(Buffer.alloc(0), '0x0', 0, this.timeSource()),
      children: new Map(),
      ephemeral: false,
      sequential: false,
    });
  }

  get state(): ZkConnectionState {
    return this.currentState;
  }

  onStateChange(listener: (state: ZkConnectionState) => void): void {
    this.stateListeners.add(listener);
  }

  private setState(state: ZkConnectionState): void {
    this.currentState = state;
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }

  connect(): Promise<void> {
    if (this.opts.failConnect) {
      const error = this.opts.connectError ?? new ZkError('Mock connection refused');
      return Promise.reject(error);
    }
    this.setState('connected');
    return Promise.resolve();
  }

  close(): void {
    this.closeCalls += 1;
    this.setState('closed');
  }

  simulateDisconnect(): void {
    if (this.currentState === 'connected') {
      this.setState('disconnected');
    }
  }

  clear(): void {
    this.nodes.clear();
    this.dataWatchers.clear();
    this.nodes.set('/', {
      data: Buffer.alloc(0),
      stat: statForNode(Buffer.alloc(0), '0x0', 0, this.timeSource()),
      children: new Map(),
      ephemeral: false,
      sequential: false,
    });
  }

  private requireNode(path: string): MockNode {
    const node = this.nodes.get(normalizePath(path));
    if (!node) {
      throw new ZkError(`Node does not exist: ${path}`, ZkErrorCode.NO_NODE);
    }
    return node;
  }

  private requireConnected(): void {
    if (this.currentState !== 'connected') {
      throw new ZkError('Not connected');
    }
  }

  async getChildren(path: string): Promise<string[]> {
    this.requireConnected();
    this.childrenRequestLog.push(path);
    const node = this.requireNode(path);
    // ZooKeeper returns children in creation order; sorting is done by the
    // tree layer, which keeps the mock faithful to the real server.
    return [...node.children.keys()];
  }

  async getData(path: string): Promise<NodeData> {
    this.requireConnected();
    const node = this.requireNode(path);
    const stat: ZnodeStat = { ...node.stat, dataLength: node.data.length };
    return { data: Buffer.from(node.data), stat };
  }

  async watchData(path: string, onEvent: (event: ZkWatchEvent) => void): Promise<void> {
    this.requireConnected();
    this.requireNode(path);
    this.dataWatchers.set(path, onEvent);
  }

  private fireDataEvent(path: string, type: ZkWatchEventType): void {
    const watcher = this.dataWatchers.get(path);
    if (!watcher) {
      return;
    }
    // ZooKeeper data watches are one-shot: firing consumes the registration.
    this.dataWatchers.delete(path);
    watcher({ type, path });
  }

  async getStat(path: string): Promise<ZnodeStat | undefined> {
    this.requireConnected();
    try {
      const node = this.requireNode(path);
      return { ...node.stat, dataLength: node.data.length };
    } catch {
      return undefined;
    }
  }

  async create(path: string, data: Buffer, mode: CreateMode): Promise<string> {
    this.requireConnected();
    const { parent, name } = parentOf(path);
    const parentNode = this.nodes.get(parent);
    if (!parentNode) {
      throw new ZkError(`Parent does not exist: ${parent}`, ZkErrorCode.NO_NODE);
    }
    if (name.length === 0 || parentNode.children.has(name)) {
      throw new ZkError(`Node already exists: ${path}`, ZkErrorCode.NODE_EXISTS);
    }
    let finalPath = path;
    let finalName = name;
    if (mode === 'PERSISTENT_SEQUENTIAL' || mode === 'EPHEMERAL_SEQUENTIAL') {
      this.sequenceCounter += 1;
      finalName = `${name}${this.sequenceCounter.toString().padStart(10, '0')}`;
      finalPath = parent === '/' ? `/${finalName}` : `${parent}/${finalName}`;
    }
    const ephemeral = mode === 'EPHEMERAL' || mode === 'EPHEMERAL_SEQUENTIAL';
    const stat = statForNode(data, ephemeral ? '0xdeadbeef' : '0x0', 0, this.timeSource());
    parentNode.children.set(finalName, {
      data: Buffer.from(data),
      stat,
      children: new Map(),
      ephemeral,
      sequential: mode === 'PERSISTENT_SEQUENTIAL' || mode === 'EPHEMERAL_SEQUENTIAL',
    });
    parentNode.stat.numChildren += 1;
    parentNode.stat.cversion += 1;
    this.nodes.set(finalPath, parentNode.children.get(finalName)!);
    this.fireDataEvent(finalPath, 'created');
    return finalPath;
  }

  async setData(path: string, data: Buffer, version: number): Promise<void> {
    this.requireConnected();
    const node = this.requireNode(path);
    if (version >= 0 && version !== node.stat.version) {
      throw new ZkError(`Bad version for ${path}`, ZkErrorCode.BAD_VERSION);
    }
    node.data = Buffer.from(data);
    node.stat.version += 1;
    node.stat.mtime = this.timeSource();
    node.stat.dataLength = data.length;
    this.fireDataEvent(path, 'changed');
  }

  async remove(path: string, version?: number): Promise<void> {
    this.requireConnected();
    const node = this.requireNode(path);
    if (node.children.size > 0) {
      throw new ZkError(`Node not empty: ${path}`, ZkErrorCode.NOT_EMPTY);
    }
    if (version !== undefined && version >= 0 && version !== node.stat.version) {
      throw new ZkError(`Bad version for ${path}`, ZkErrorCode.BAD_VERSION);
    }
    const { parent, name } = parentOf(path);
    const parentNode = this.nodes.get(parent);
    if (!parentNode) {
      throw new ZkError(`Parent does not exist: ${parent}`, ZkErrorCode.NO_NODE);
    }
    parentNode.children.delete(name);
    parentNode.stat.numChildren -= 1;
    parentNode.stat.cversion += 1;
    this.nodes.delete(path);
    this.removalLog.push(path);
    this.fireDataEvent(path, 'deleted');
  }

  async exists(path: string): Promise<boolean> {
    this.requireConnected();
    try {
      return this.nodes.has(normalizePath(path));
    } catch {
      return false;
    }
  }
}
