import * as assert from 'assert';
import {
  buildZkConnectionString,
  ConnectionStore,
  initializeConnectionStore,
  type KeyValueStorage,
} from '../../src/connections/connection-store';
import type { SecretStorageLike } from '../../src/connections/secret-storage';

class FakeKeyValue implements KeyValueStorage {
  private readonly data = new Map<string, unknown>();
  readonly reads: string[] = [];

  get<T>(key: string): T | undefined {
    this.reads.push(key);
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

class FailingKeyValue extends FakeKeyValue {
  async update(): Promise<void> {
    throw new Error('storage unavailable');
  }
}

class ConcurrentMigrationKeyValue extends FakeKeyValue {
  private readonly initialWrites: Array<{
    key: string;
    value: unknown;
    resolve: () => void;
  }> = [];

  async update(key: string, value: unknown): Promise<void> {
    if (key !== 'zkViewer.connections' || this.initialWrites.length >= 2) {
      return super.update(key, value);
    }
    await new Promise<void>((resolve) => {
      this.initialWrites.push({ key, value, resolve });
      if (this.initialWrites.length === 2) {
        for (const write of this.initialWrites) {
          void super.update(write.key, write.value);
          write.resolve();
        }
      }
    });
  }
}

describe('ConnectionStore', () => {
  let storage: FakeKeyValue;
  let secrets: FakeSecrets;
  let store: ConnectionStore;

  beforeEach(() => {
    storage = new FakeKeyValue();
    secrets = new FakeSecrets();
    store = new ConnectionStore(storage, secrets);
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
    const reloaded = new ConnectionStore(storage, secrets);
    assert.strictEqual((await reloaded.list()).length, 1);
  });

  it('stores passwords in secrets, never in ordinary state', async () => {
    await store.save({ id: 'c1', name: 'Dev', hosts: 'h:2181', username: 'alice' }, 's3cret');

    const persisted = storage.get<Array<{ password?: string }>>('zkViewer.connections') ?? [];
    assert.ok(persisted.length === 1, 'config should be persisted');
    assert.strictEqual(persisted[0].password, undefined, 'password must not be in ordinary state');

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

  it('allows users to save duplicate endpoints with different ids', async () => {
    await store.save({ id: 'c1', name: 'First', hosts: 'h:2181' });
    await store.save({ id: 'c2', name: 'Second', hosts: 'h:2181', username: '' });

    assert.strictEqual((await store.list()).length, 2);
  });
});

describe('initializeConnectionStore', () => {
  it('shares connections across windows with different workspace storage', async () => {
    const global = new FakeKeyValue();
    const secrets = new FakeSecrets();
    const windowA = await initializeConnectionStore(global, new FakeKeyValue(), secrets);
    const windowB = await initializeConnectionStore(global, new FakeKeyValue(), secrets);
    const config = { id: 'c1', name: 'Dev', hosts: 'h:2181' };

    await windowA.save(config);

    assert.deepStrictEqual(await windowB.list(), [config]);
  });

  it('migrates connections saved by an older version in workspace storage', async () => {
    const global = new FakeKeyValue();
    const workspace = new FakeKeyValue();
    const secrets = new FakeSecrets();
    const legacy = { id: 'legacy', name: 'Legacy', hosts: 'old:2181' };
    await workspace.update('zkViewer.connections', [legacy]);

    const store = await initializeConnectionStore(global, workspace, secrets);

    assert.deepStrictEqual(await store.list(), [legacy]);
  });

  it('runs the migration wrapper only when legacy connections exist', async () => {
    const global = new FakeKeyValue();
    const workspace = new FakeKeyValue();
    const secrets = new FakeSecrets();
    await workspace.update('zkViewer.connections', [{ id: 'legacy', name: 'Legacy', hosts: 'old:2181' }]);
    let runs = 0;

    await initializeConnectionStore(global, workspace, secrets, async (task) => {
      runs += 1;
      await task();
    });
    await initializeConnectionStore(global, workspace, secrets, async () => {
      runs += 1;
    });

    assert.strictEqual(runs, 1);
  });

  it('merges connections from multiple legacy workspaces without overwriting global entries', async () => {
    const global = new FakeKeyValue();
    const secrets = new FakeSecrets();
    const globalConfig = { id: 'shared', name: 'Global', hosts: 'new:2181' };
    const legacyA = { id: 'a', name: 'A', hosts: 'a:2181' };
    const legacyB = { id: 'b', name: 'B', hosts: 'b:2181' };
    await global.update('zkViewer.connections', [globalConfig]);
    const workspaceA = new FakeKeyValue();
    const workspaceB = new FakeKeyValue();
    await workspaceA.update('zkViewer.connections', [
      { id: 'shared', name: 'Stale', hosts: 'old:2181' },
      legacyA,
    ]);
    await workspaceB.update('zkViewer.connections', [legacyB]);

    await initializeConnectionStore(global, workspaceA, secrets);
    const store = await initializeConnectionStore(global, workspaceB, secrets);

    assert.deepStrictEqual(await store.list(), [globalConfig, legacyA, legacyB]);
  });

  it('discards migrated duplicates by hosts and username without overwriting global entries', async () => {
    const global = new FakeKeyValue();
    const workspace = new FakeKeyValue();
    const secrets = new FakeSecrets();
    const existing = {
      id: 'global',
      name: 'Keep Global',
      hosts: 'ZK.Example:2181',
      chroot: '/global',
    };
    const differentAccount = {
      id: 'legacy-account',
      name: 'Different Account',
      hosts: 'zk.example:2181',
      username: 'alice',
    };
    const differentPort = {
      id: 'legacy-port',
      name: 'Different Port',
      hosts: 'zk.example:2182',
    };
    await global.update('zkViewer.connections', [existing]);
    await workspace.update('zkViewer.connections', [
      {
        id: 'legacy-duplicate',
        name: 'Discard Legacy',
        hosts: ' zk.example:2181 ',
        username: '   ',
        chroot: '/legacy',
      },
      differentAccount,
      differentPort,
    ]);

    const store = await initializeConnectionStore(global, workspace, secrets);

    assert.deepStrictEqual(await store.list(), [existing, differentAccount, differentPort]);
  });

  it('converges when multiple legacy workspaces migrate concurrently', async () => {
    const global = new ConcurrentMigrationKeyValue();
    const secrets = new FakeSecrets();
    const workspaceA = new FakeKeyValue();
    const workspaceB = new FakeKeyValue();
    const legacyA = { id: 'a', name: 'A', hosts: 'a:2181' };
    const legacyB = { id: 'b', name: 'B', hosts: 'b:2181' };
    await workspaceA.update('zkViewer.connections', [legacyA]);
    await workspaceB.update('zkViewer.connections', [legacyB]);

    await Promise.all([
      initializeConnectionStore(global, workspaceA, secrets),
      initializeConnectionStore(global, workspaceB, secrets),
    ]);

    assert.deepStrictEqual(global.get('zkViewer.connections'), [legacyB, legacyA]);
  });

  it('does not restore a removed global connection after the workspace was migrated', async () => {
    const global = new FakeKeyValue();
    const workspace = new FakeKeyValue();
    const secrets = new FakeSecrets();
    const legacy = { id: 'legacy', name: 'Legacy', hosts: 'old:2181' };
    await workspace.update('zkViewer.connections', [legacy]);
    const store = await initializeConnectionStore(global, workspace, secrets);
    await store.remove(legacy.id);

    const reloaded = await initializeConnectionStore(global, workspace, secrets);

    assert.deepStrictEqual(await reloaded.list(), []);
  });

  it('only reads the migration marker after a workspace was migrated', async () => {
    const global = new FakeKeyValue();
    const workspace = new FakeKeyValue();
    const secrets = new FakeSecrets();
    await workspace.update('zkViewer.connectionsMigratedToGlobal.v1', true);

    await initializeConnectionStore(global, workspace, secrets);

    assert.deepStrictEqual(workspace.reads, ['zkViewer.connectionsMigratedToGlobal.v1']);
  });

  it('does not copy unexpected password fields from legacy state', async () => {
    const global = new FakeKeyValue();
    const workspace = new FakeKeyValue();
    const secrets = new FakeSecrets();
    await workspace.update('zkViewer.connections', [
      { id: 'legacy', name: 'Legacy', hosts: 'old:2181', password: 'plaintext' },
    ]);

    await initializeConnectionStore(global, workspace, secrets);

    assert.deepStrictEqual(global.get('zkViewer.connections'), [
      { id: 'legacy', name: 'Legacy', hosts: 'old:2181' },
    ]);
  });

  it('does not mark migration complete when the global write fails', async () => {
    const global = new FailingKeyValue();
    const workspace = new FakeKeyValue();
    const secrets = new FakeSecrets();
    await workspace.update('zkViewer.connections', [{ id: 'legacy', name: 'Legacy', hosts: 'old:2181' }]);

    await assert.rejects(() => initializeConnectionStore(global, workspace, secrets), /storage unavailable/);

    assert.strictEqual(workspace.get<boolean>('zkViewer.connectionsMigratedToGlobal.v1'), undefined);
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
