import * as assert from 'assert';
import {
  ConnectionManager,
  type ClientFactory,
  type ClientFactoryOptions,
} from '../../src/connections/connection-manager';
import type { ConnectionConfig } from '../../src/connections/connection-store';
import type { NodeData, ZkClient, ZkConnectionState, ZnodeStat } from '../../src/zk/zk-client';

class FakeClient implements ZkClient {
  state: ZkConnectionState = 'closed';
  connectCalls = 0;
  closeCalls = 0;
  script: Array<() => Promise<void>> = [];
  private readonly listeners = new Set<(state: ZkConnectionState) => void>();

  onStateChange(listener: (state: ZkConnectionState) => void): void {
    this.listeners.add(listener);
  }

  connect(): Promise<void> {
    this.connectCalls += 1;
    const action = this.script.length > 0 ? this.script.shift()! : async () => this.setState('connected');
    return action().then(() => {
      if (this.state !== 'connected') {
        this.setState('connected');
      }
    });
  }

  close(): void {
    this.closeCalls += 1;
    this.setState('closed');
  }

  simulateDisconnect(): void {
    this.setState('disconnected');
  }

  simulateConnect(): void {
    this.setState('connected');
  }

  simulateSessionExpired(): void {
    this.setState('session-expired');
  }

  private setState(state: ZkConnectionState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  getChildren(): Promise<string[]> {
    return Promise.resolve([]);
  }

  getData(): Promise<NodeData> {
    return Promise.reject(new Error('not implemented'));
  }

  getStat(): Promise<ZnodeStat | undefined> {
    return Promise.resolve(undefined);
  }

  watchData(): Promise<void> {
    return Promise.resolve();
  }

  create(): Promise<string> {
    return Promise.reject(new Error('not implemented'));
  }

  setData(): Promise<void> {
    return Promise.reject(new Error('not implemented'));
  }

  remove(): Promise<void> {
    return Promise.reject(new Error('not implemented'));
  }

  exists(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

const config: ConnectionConfig = { id: 'c1', name: 'Dev', hosts: 'localhost:2181' };

describe('ConnectionManager', () => {
  it('transitions connecting -> connected and resets attempts after success', async () => {
    const clients: FakeClient[] = [];
    const factory: ClientFactory = (_config, _opts) => {
      const client = new FakeClient();
      clients.push(client);
      return client;
    };
    const manager = new ConnectionManager(factory, { maxReconnectAttempts: 3, reconnectDelayMs: 5 });
    const states: ZkConnectionState[] = [];
    manager.onStateChange((state) => states.push(state));

    await manager.connect(config);

    assert.strictEqual(manager.getState(), 'connected');
    assert.deepStrictEqual(states, ['connecting', 'connected']);
    assert.strictEqual(clients.length, 1);
    assert.strictEqual(clients[0].connectCalls, 1);
  });

  it('enters disconnected with an error message after exhausting retries', async () => {
    const factory: ClientFactory = () => {
      const client = new FakeClient();
      client.script = [
        async () => {
          throw new Error('connection refused');
        },
        async () => {
          throw new Error('connection refused');
        },
      ];
      return client;
    };
    const manager = new ConnectionManager(factory, { maxReconnectAttempts: 1, reconnectDelayMs: 5 });

    await assert.rejects(() => manager.connect(config), /connection refused/);
    assert.strictEqual(manager.getState(), 'disconnected');
    assert.match(manager.getLastError()?.message ?? '', /connection refused/);
  });

  it('reconnects after connection loss and stops after the maximum', async () => {
    const clients: FakeClient[] = [];
    const factory: ClientFactory = () => {
      const client = new FakeClient();
      clients.push(client);
      return client;
    };
    const manager = new ConnectionManager(factory, { maxReconnectAttempts: 2, reconnectDelayMs: 5 });
    await manager.connect(config);
    assert.strictEqual(manager.getState(), 'connected');

    clients[0].simulateDisconnect();
    // The manager no longer creates a fresh client; it waits for the library
    // to recover within the window (2 attempts x 5ms). Simulate recovery by
    // re-emitting 'connected', which must cancel the window and return to
    // connected without creating a new client.
    clients[0].simulateConnect();
    await new Promise((resolve) => setTimeout(resolve, 40));

    assert.strictEqual(manager.getState(), 'connected');
    assert.strictEqual(clients.length, 1, 'no fresh client should be created during recovery');
    assert.strictEqual(clients[0].closeCalls, 0, 'the recovering client should not be closed');
  });

  it('tears down the client and stays disconnected when recovery times out', async () => {
    const clients: FakeClient[] = [];
    const factory: ClientFactory = () => {
      const client = new FakeClient();
      clients.push(client);
      return client;
    };
    const manager = new ConnectionManager(factory, { maxReconnectAttempts: 1, reconnectDelayMs: 5 });
    await manager.connect(config);
    assert.strictEqual(manager.getState(), 'connected');

    clients[0].simulateDisconnect();
    await new Promise((resolve) => setTimeout(resolve, 40));

    assert.strictEqual(manager.getState(), 'disconnected');
    assert.strictEqual(clients[0].closeCalls, 1, 'the client should be closed after the window');
    assert.match(manager.getLastError()?.message ?? '', /Reconnect attempts exhausted/);
  });

  it('marks the state session-expired and tears the client down on expiry', async () => {
    const clients: FakeClient[] = [];
    const factory: ClientFactory = () => {
      const client = new FakeClient();
      clients.push(client);
      return client;
    };
    const manager = new ConnectionManager(factory, { maxReconnectAttempts: 2, reconnectDelayMs: 5 });
    await manager.connect(config);
    assert.strictEqual(manager.getState(), 'connected');

    clients[0].simulateSessionExpired();
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.strictEqual(manager.getState(), 'session-expired');
    assert.strictEqual(clients[0].closeCalls, 1, 'an expired session client should be closed');
  });

  it('closes the client and clears state on disconnect', async () => {
    const clients: FakeClient[] = [];
    const factory: ClientFactory = () => {
      const client = new FakeClient();
      clients.push(client);
      return client;
    };
    const manager = new ConnectionManager(factory, { maxReconnectAttempts: 2, reconnectDelayMs: 5 });
    await manager.connect(config);
    manager.disconnect();

    assert.strictEqual(manager.getState(), 'closed');
    assert.strictEqual(clients[0].closeCalls, 1);
  });

  it('passes password and session timeout to the factory', async () => {
    let received: { sessionTimeoutMs: number; password?: string } | undefined;
    const factory: ClientFactory = (_config, options: ClientFactoryOptions) => {
      received = options;
      return new FakeClient();
    };
    const manager = new ConnectionManager(factory, { maxReconnectAttempts: 1, reconnectDelayMs: 5 });
    await manager.connect({ ...config, sessionTimeoutMs: 12345 }, 'pw');
    assert.deepStrictEqual(received, { sessionTimeoutMs: 12345, password: 'pw' });
  });
});
