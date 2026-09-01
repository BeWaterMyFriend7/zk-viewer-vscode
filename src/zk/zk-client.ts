import type { Client, Exception, Stat as ZkStat } from 'node-zookeeper-client';

export type CreateMode = 'PERSISTENT' | 'PERSISTENT_SEQUENTIAL' | 'EPHEMERAL' | 'EPHEMERAL_SEQUENTIAL';

export type ZkConnectionState = 'connecting' | 'connected' | 'disconnected' | 'session-expired' | 'closed';

export interface ZnodeStat {
  czxid: string;
  mzxid: string;
  pzxid: string;
  ctime: string;
  mtime: string;
  version: number;
  cversion: number;
  aversion: number;
  ephemeralOwner: string;
  dataLength: number;
  numChildren: number;
}

export interface NodeData {
  data: Buffer;
  stat: ZnodeStat;
}

export type ZkWatchEventType = 'created' | 'deleted' | 'changed' | 'children-changed' | 'unknown';

export interface ZkWatchEvent {
  type: ZkWatchEventType;
  path: string;
}

export const ZkErrorCode = {
  NO_NODE: 'NO_NODE',
  NODE_EXISTS: 'NODE_EXISTS',
  NOT_EMPTY: 'NOT_EMPTY',
  BAD_VERSION: 'BAD_VERSION',
  NO_AUTH: 'NO_AUTH',
} as const;

export type ZkErrorCodeValue = (typeof ZkErrorCode)[keyof typeof ZkErrorCode];

export class ZkError extends Error {
  constructor(
    message: string,
    readonly code?: ZkErrorCodeValue,
  ) {
    super(message);
    this.name = 'ZkError';
  }
}

export interface ZkClient {
  readonly state: ZkConnectionState;
  connect(): Promise<void>;
  close(): void;
  onStateChange(listener: (state: ZkConnectionState) => void): void;
  getChildren(path: string): Promise<string[]>;
  getData(path: string): Promise<NodeData>;
  getStat(path: string): Promise<ZnodeStat | undefined>;
  /**
   * Registers a one-shot data watch for the node. The listener fires on the
   * next data change or deletion; callers must re-register to keep watching.
   */
  watchData(path: string, onEvent: (event: ZkWatchEvent) => void): Promise<void>;
  create(path: string, data: Buffer, mode: CreateMode): Promise<string>;
  setData(path: string, data: Buffer, version: number): Promise<void>;
  remove(path: string, version?: number): Promise<void>;
  exists(path: string): Promise<boolean>;
}

export function buildDigestAuth(username: string, password: string): { scheme: string; auth: Buffer } {
  return { scheme: 'digest', auth: Buffer.from(`${username}:${password}`, 'utf8') };
}

/**
 * Lazy-loads the native ZooKeeper addon. Importing this module never touches
 * the native binary, so unit tests and mock mode stay usable in any Node ABI.
 */
function loadZookeeper(): typeof import('node-zookeeper-client') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node-zookeeper-client') as typeof import('node-zookeeper-client');
}

function idToString(value: Buffer | string): string {
  if (!Buffer.isBuffer(value)) {
    return value;
  }
  const hex = value.toString('hex').replace(/^0+/, '');
  return hex === '' ? '0x0' : '0x' + hex;
}

function statToZnodeStat(stat: ZkStat): ZnodeStat {
  return {
    czxid: idToString(stat.czxid),
    mzxid: idToString(stat.mzxid),
    pzxid: idToString(stat.pzxid),
    // ZooKeeper stores ctime/mtime as 8-byte big-endian milliseconds. We keep
    // the raw millisecond string so sorting stays numeric, and format it to a
    // readable local time at the display layer.
    ctime: millisToString(stat.ctime),
    mtime: millisToString(stat.mtime),
    version: stat.version,
    cversion: stat.cversion,
    aversion: stat.aversion,
    ephemeralOwner: idToString(stat.ephemeralOwner),
    dataLength: stat.dataLength,
    numChildren: stat.numChildren,
  };
}

function millisToString(value: Buffer | string | number): string {
  if (Buffer.isBuffer(value)) {
    return value.length === 8 ? Number(value.readBigInt64BE(0)).toString() : String(value);
  }
  return String(value);
}

export interface NodeZkClientOptions {
  sessionTimeoutMs: number;
  connectTimeoutMs?: number;
  username?: string;
  password?: string;
}

export class NodeZkClient implements ZkClient {
  private readonly zk: typeof import('node-zookeeper-client');
  private readonly client: Client;
  private readonly stateListeners = new Set<(state: ZkConnectionState) => void>();
  private currentState: ZkConnectionState = 'closed';
  private persistentHandlerWired = false;

  constructor(
    connectionString: string,
    private readonly opts: NodeZkClientOptions,
  ) {
    this.zk = loadZookeeper();
    this.client = this.zk.createClient(connectionString, {
      sessionTimeout: opts.sessionTimeoutMs,
      spinDelay: 1000,
      retries: 0,
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
    return new Promise<void>((resolve, reject) => {
      if (this.opts.username && this.opts.password) {
        this.client.addAuthInfo('digest', buildDigestAuth(this.opts.username, this.opts.password).auth);
      }
      const timeoutMs = this.opts.connectTimeoutMs ?? Math.max(this.opts.sessionTimeoutMs, 5000);
      const timer = setTimeout(() => {
        cleanup();
        reject(new ZkError(`Connection timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const onConnected = () => {
        cleanup();
        this.wirePersistentHandler();
        this.setState('connected');
        resolve();
      };
      const onAuthFailed = () => {
        cleanup();
        reject(new ZkError('Authentication failed', ZkErrorCode.NO_AUTH));
      };
      const onExpired = () => {
        cleanup();
        reject(new ZkError('Session expired'));
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.client.removeListener('connected', onConnected);
        this.client.removeListener('authenticationFailed', onAuthFailed);
        this.client.removeListener('expired', onExpired);
      };
      this.client.once('connected', onConnected);
      this.client.once('authenticationFailed', onAuthFailed);
      this.client.once('expired', onExpired);
      this.setState('connecting');
      this.client.connect();
    });
  }

  private wirePersistentHandler(): void {
    if (this.persistentHandlerWired) {
      return;
    }
    this.persistentHandlerWired = true;
    // The underlying library auto-reconnects after a socket drop while keeping
    // the session. When it succeeds it re-emits 'connected', so mirror that
    // state here so the extension never thinks it is still disconnected.
    this.client.on('connected', () => {
      this.setState('connected');
    });
    this.client.on('disconnected', () => this.setState('disconnected'));
    this.client.on('expired', () => this.setState('session-expired'));
    this.client.on('authenticationFailed', () => this.setState('session-expired'));
  }

  close(): void {
    this.client.close();
    this.setState('closed');
  }

  private mapError(err: unknown): Error {
    if (err instanceof Error) {
      const anyErr = err as Error & { code?: number; getCode?: () => number };
      const code = anyErr.code ?? (typeof anyErr.getCode === 'function' ? anyErr.getCode() : undefined);
      const exception = this.zk.Exception;
      if (code === exception.NO_NODE) {
        return new ZkError(err.message, ZkErrorCode.NO_NODE);
      }
      if (code === exception.NODE_EXISTS) {
        return new ZkError(err.message, ZkErrorCode.NODE_EXISTS);
      }
      if (code === exception.NOT_EMPTY) {
        return new ZkError(err.message, ZkErrorCode.NOT_EMPTY);
      }
      if (code === exception.BAD_VERSION) {
        return new ZkError(err.message, ZkErrorCode.BAD_VERSION);
      }
      if (code === exception.NO_AUTH) {
        return new ZkError(err.message, ZkErrorCode.NO_AUTH);
      }
      return err;
    }
    return new Error(String(err));
  }

  getChildren(path: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      this.client.getChildren(path, (err, children) => {
        if (err) {
          reject(this.mapError(err));
          return;
        }
        resolve(children ?? []);
      });
    });
  }

  getData(path: string): Promise<NodeData> {
    return new Promise<NodeData>((resolve, reject) => {
      this.client.getData(path, (err, data, stat) => {
        if (err) {
          reject(this.mapError(err));
          return;
        }
        resolve({ data: data ?? Buffer.alloc(0), stat: statToZnodeStat(stat) });
      });
    });
  }

  watchData(path: string, onEvent: (event: ZkWatchEvent) => void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.client.getData(
        path,
        (event) => {
          onEvent({ type: this.mapWatchEventType(event.type), path: event.path });
        },
        (err) => {
          if (err) {
            reject(this.mapError(err));
            return;
          }
          resolve();
        },
      );
    });
  }

  private mapWatchEventType(type: number): ZkWatchEventType {
    const event = this.zk.Event;
    if (type === event.NODE_CREATED) {
      return 'created';
    }
    if (type === event.NODE_DELETED) {
      return 'deleted';
    }
    if (type === event.NODE_DATA_CHANGED) {
      return 'changed';
    }
    if (type === event.NODE_CHILDREN_CHANGED) {
      return 'children-changed';
    }
    return 'unknown';
  }

  create(path: string, data: Buffer, mode: CreateMode): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.client.create(path, data, this.zk.CreateMode[mode], (err, createdPath) => {
        if (err) {
          reject(this.mapError(err));
          return;
        }
        resolve(createdPath);
      });
    });
  }

  setData(path: string, data: Buffer, version: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.client.setData(path, data, version, (err) => {
        if (err) {
          reject(this.mapError(err));
          return;
        }
        resolve();
      });
    });
  }

  remove(path: string, version?: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const callback = (err: Error | Exception | null) => {
        if (err) {
          reject(this.mapError(err));
          return;
        }
        resolve();
      };
      if (version === undefined) {
        this.client.remove(path, callback);
      } else {
        this.client.remove(path, version, callback);
      }
    });
  }

  exists(path: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.client.exists(path, (err, stat) => {
        if (err) {
          reject(this.mapError(err));
          return;
        }
        resolve(stat !== undefined && stat !== null);
      });
    });
  }

  getStat(path: string): Promise<ZnodeStat | undefined> {
    return new Promise<ZnodeStat | undefined>((resolve, reject) => {
      this.client.exists(path, (err, stat) => {
        if (err) {
          reject(this.mapError(err));
          return;
        }
        resolve(stat ? statToZnodeStat(stat) : undefined);
      });
    });
  }
}
