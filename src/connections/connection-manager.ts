import type { ConnectionConfig } from './connection-store';
import type { ZkClient, ZkConnectionState } from '../zk/zk-client';

export interface ClientFactoryOptions {
  sessionTimeoutMs: number;
  password?: string;
}

export type ClientFactory = (config: ConnectionConfig, options: ClientFactoryOptions) => ZkClient;

export interface ConnectionManagerOptions {
  maxReconnectAttempts: number;
  reconnectDelayMs: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ConnectionManager {
  private client: ZkClient | undefined;
  private currentConfig: ConnectionConfig | undefined;
  private currentPassword: string | undefined;
  private state: ZkConnectionState = 'closed';
  private readonly listeners = new Set<(state: ZkConnectionState) => void>();
  private attempts = 0;
  private explicitClose = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private lostInProgress = false;
  private lastError: Error | undefined;

  constructor(
    private readonly factory: ClientFactory,
    private readonly opts: ConnectionManagerOptions,
  ) {}

  getState(): ZkConnectionState {
    return this.state;
  }

  getLastError(): Error | undefined {
    return this.lastError;
  }

  getClient(): ZkClient | undefined {
    return this.client;
  }

  onStateChange(listener: (state: ZkConnectionState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async connect(config: ConnectionConfig, password?: string): Promise<void> {
    this.explicitClose = false;
    this.attempts = 0;
    this.lastError = undefined;
    this.currentConfig = config;
    this.currentPassword = password;
    await this.establish(config);
  }

  disconnect(): void {
    this.explicitClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.client) {
      const client = this.client;
      this.client = undefined;
      client.close();
    }
    this.setState('closed');
  }

  private setState(state: ZkConnectionState): void {
    if (state === this.state) {
      return;
    }
    this.state = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  private async establish(config: ConnectionConfig): Promise<void> {
    if (this.explicitClose) {
      return;
    }
    this.setState('connecting');
    const previous = this.client;
    const client = this.factory(config, {
      sessionTimeoutMs: config.sessionTimeoutMs ?? 10000,
      password: this.currentPassword,
    });
    this.client = client;
    client.onStateChange((state) => {
      if (this.client !== client) {
        return;
      }
      if (state === 'disconnected' && !this.explicitClose) {
        void this.handleLost();
      }
      if (state !== this.state) {
        this.emitState(state);
      }
    });
    if (previous && previous !== client) {
      previous.close();
    }
    try {
      await client.connect();
    } catch (err) {
      await this.handleFailure(err);
      return;
    }
    if (this.client === client) {
      this.attempts = 0;
      this.setState('connected');
    }
  }

  private emitState(state: ZkConnectionState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  private async handleLost(): Promise<void> {
    if (this.explicitClose || this.lostInProgress || !this.currentConfig) {
      return;
    }
    this.lostInProgress = true;
    try {
      this.attempts += 1;
      if (this.attempts > this.opts.maxReconnectAttempts) {
        this.lastError = new Error('Maximum reconnect attempts reached');
        this.setState('disconnected');
        return;
      }
      this.setState('disconnected');
      await delay(this.opts.reconnectDelayMs);
      if (this.explicitClose) {
        return;
      }
      await this.establish(this.currentConfig).catch((err: unknown) => {
        this.lastError = err instanceof Error ? err : new Error(String(err));
      });
    } finally {
      this.lostInProgress = false;
    }
  }

  private async handleFailure(err: unknown): Promise<void> {
    const error = err instanceof Error ? err : new Error(String(err));
    this.attempts += 1;
    if (this.attempts > this.opts.maxReconnectAttempts) {
      this.lastError = error;
      this.setState('disconnected');
      throw error;
    }
    this.setState('disconnected');
    await delay(this.opts.reconnectDelayMs);
    if (this.explicitClose || !this.currentConfig) {
      return;
    }
    await this.establish(this.currentConfig);
  }
}
