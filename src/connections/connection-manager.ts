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

export class ConnectionManager {
  private client: ZkClient | undefined;
  private currentPassword: string | undefined;
  private state: ZkConnectionState = 'closed';
  private readonly listeners = new Set<(state: ZkConnectionState) => void>();
  private explicitClose = false;
  private recoveryTimer: ReturnType<typeof setTimeout> | undefined;
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
    this.lastError = undefined;
    this.currentPassword = password;
    await this.establish(config);
  }

  disconnect(): void {
    this.explicitClose = true;
    this.cancelRecovery();
    this.teardownClient();
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
    client.onStateChange((state) => this.handleClientState(client, state));
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
      this.setState('connected');
    }
  }

  /**
   * Centralised state handling. The underlying library auto-reconnects while
   * keeping its session, so a plain 'disconnected' is treated as a bounded
   * recovery window rather than a tear-down. Only a real session expiry or a
   * window timeout tears the client down.
   */
  private handleClientState(client: ZkClient, state: ZkConnectionState): void {
    if (this.client !== client) {
      return;
    }
    if (state === 'connected') {
      this.cancelRecovery();
      this.setState('connected');
      return;
    }
    if (state === 'session-expired') {
      this.cancelRecovery();
      this.lastError = new Error('Session expired; reconnect required');
      this.setState('session-expired');
      this.teardownClient();
      return;
    }
    if (state === 'closed' && this.state === 'session-expired') {
      // The teardown we triggered for an expired session also closes the
      // client, which re-emits 'closed'. Keep session-expired as the
      // authoritative state until the user explicitly reconnects.
      return;
    }
    if (state === 'disconnected' && this.state !== 'disconnected') {
      this.startRecovery();
      this.setState('disconnected');
      return;
    }
    if (state !== this.state) {
      this.setState(state);
    }
  }

  private startRecovery(): void {
    if (this.recoveryTimer) {
      return;
    }
    // The underlying client keeps its session while the socket is down. Give
    // it a bounded window (roughly the reconnect budget) to recover before we
    // give up and tear it down, which stops the library's endless reconnect.
    const windowMs = this.opts.maxReconnectAttempts * this.opts.reconnectDelayMs;
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = undefined;
      this.handleRecoveryTimeout();
    }, windowMs);
  }

  private handleRecoveryTimeout(): void {
    if (this.explicitClose) {
      return;
    }
    this.lastError = new Error('Reconnect attempts exhausted');
    this.teardownClient();
    this.setState('disconnected');
  }

  private async handleFailure(err: unknown): Promise<void> {
    const error = err instanceof Error ? err : new Error(String(err));
    this.lastError = error;
    this.teardownClient();
    this.setState('disconnected');
    throw error;
  }

  private cancelRecovery(): void {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = undefined;
    }
  }

  private teardownClient(): void {
    this.cancelRecovery();
    if (this.client) {
      const client = this.client;
      this.client = undefined;
      client.close();
    }
  }
}
