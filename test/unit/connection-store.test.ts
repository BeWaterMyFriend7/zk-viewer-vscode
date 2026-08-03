import * as assert from 'assert';
import {
  buildZkConnectionString,
  ConnectionStore,
  type KeyValueStorage,
} from '../../src/connections/connection-store';
import type { SecretStorageLike } from '../../src/connections/secret-storage';

class FakeKeyValue implements KeyValueStorage {
  private readonly data = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }
}

class FakeSecrets implements SecretStorageLike {
  private readonly data = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.data.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

describe('ConnectionStore', () => {
  let workspace: FakeKeyValue;
  let secrets: FakeSecrets;
  let store: ConnectionStore;

  beforeEach(() => {
    workspace = new FakeKeyValue();
    secrets = new FakeSecrets();
    store = new ConnectionStore(workspace, secrets);
  });

  it('saves, lists, gets and removes connection configs', async () => {
    const config = { id: 'c1', name: 'Dev', hosts: 'localhost:2181', chroot: '/app' };
    await store.save(config);

    assert.deepStrictEqual(await store.list(), [config]);
    assert.deepStrictEqual(await store.get('c1'), config);

    await store.remove('c1');
    assert.deepStrictEqual(await store.list(), []);
    assert.strictEqual(await store.get('c1'), undefined);
  });

  it('persists data across store instances backed by the same storage', async () => {
    await store.save({ id: 'c1', name: 'Dev', hosts: 'h:2181' });
    const reloaded = new ConnectionStore(workspace, secrets);
    assert.strictEqual((await reloaded.list()).length, 1);
  });

  it('stores passwords in secrets, never in the workspace config', async () => {
    await store.save({ id: 'c1', name: 'Dev', hosts: 'h:2181', username: 'alice' }, 's3cret');

    const persisted = workspace.get<Array<{ password?: string }>>('zkViewer.connections') ?? [];
    assert.ok(persisted.length === 1, 'config should be persisted');
    assert.strictEqual(persisted[0].password, undefined, 'password must not be in workspace config');

    const rawSecrets = secrets as unknown as { data: Map<string, string> };
    const secretEntries = [...rawSecrets.data.entries()];
    assert.strictEqual(secretEntries.length, 1, 'exactly one secret should exist');
    assert.strictEqual(secretEntries[0][1], 's3cret');

    assert.strictEqual(await store.getPassword('c1'), 's3cret');
  });

  it('removing a connection also deletes its password', async () => {
    await store.save({ id: 'c1', name: 'Dev', hosts: 'h:2181' }, 'pw');
    await store.remove('c1');
    assert.strictEqual(await store.getPassword('c1'), undefined);
  });
});

describe('buildZkConnectionString', () => {
  it('combines hosts and chroot', () => {
    assert.strictEqual(
      buildZkConnectionString({ id: 'x', name: 'x', hosts: 'h1:2181,h2:2181', chroot: '/app' }),
      'h1:2181,h2:2181/app',
    );
  });

  it('omits an empty chroot', () => {
    assert.strictEqual(
      buildZkConnectionString({ id: 'x', name: 'x', hosts: 'localhost:2181' }),
      'localhost:2181',
    );
  });

  it('requests TLS with the ssl:// scheme', () => {
    assert.strictEqual(
      buildZkConnectionString({
        id: 'x',
        name: 'x',
        hosts: 'zk.example:2181',
        chroot: '/prod',
        secure: true,
      }),
      'ssl://zk.example:2181/prod',
    );
  });
});
