import {
  ZkError,
  ZkErrorCode,
  type CreateMode,
  type NodeData,
  type ZkClient,
  type ZkConnectionState,
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

function nowString(): string {
  return new Date().toISOString();
}

function statForNode(data: Buffer, ephemeralOwner: string, numChildren: number): ZnodeStat {
  return {
    czxid: '0x1',
    mzxid: '0x1',
    pzxid: '0x1',
    ctime: nowString(),
    mtime: nowString(),
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
  closeCalls = 0;
  readonly childrenRequestLog: string[] = [];
  readonly removalLog: string[] = [];

  constructor(private readonly opts: MockZkClientOptions = {}) {
    this.nodes.set('/', {
      data: Buffer.alloc(0),
      stat: statForNode(Buffer.alloc(0), '0x0', 0),
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
    this.nodes.set('/', {
      data: Buffer.alloc(0),
      stat: statForNode(Buffer.alloc(0), '0x0', 0),
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
    return [...node.children.keys()].sort();
  }

  async getData(path: string): Promise<NodeData> {
    this.requireConnected();
    const node = this.requireNode(path);
    const stat: ZnodeStat = { ...node.stat, dataLength: node.data.length };
    return { data: Buffer.from(node.data), stat };
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
    const stat = statForNode(data, ephemeral ? '0xdeadbeef' : '0x0', 0);
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
    node.stat.mtime = nowString();
    node.stat.dataLength = data.length;
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
