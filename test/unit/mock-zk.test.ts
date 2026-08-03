import * as assert from 'assert';
import { MockZkClient } from '../../src/zk/mock-zk';
import { ZkError, ZkErrorCode } from '../../src/zk/zk-client';

async function expectZkError(promise: Promise<unknown>, code?: string): Promise<ZkError> {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof ZkError, `expected ZkError, got ${String(err)}`);
    if (code !== undefined) {
      assert.strictEqual((err as ZkError).code, code);
    }
    return err as ZkError;
  }
  assert.fail('expected promise to reject');
}

describe('MockZkClient', () => {
  let client: MockZkClient;

  beforeEach(async () => {
    client = new MockZkClient();
    await client.connect();
  });

  it('starts with an empty root and requires a connection', async () => {
    assert.deepStrictEqual(await client.getChildren('/'), []);
    const closed = new MockZkClient();
    await expectZkError(closed.getChildren('/'), undefined);
  });

  it('creates nodes, reads data and lists children', async () => {
    const created = await client.create('/app', Buffer.from('{}'), 'PERSISTENT');
    assert.strictEqual(created, '/app');
    await client.create('/app/config', Buffer.from('{"a":1}'), 'PERSISTENT');

    assert.deepStrictEqual(await client.getChildren('/app'), ['config']);
    const data = await client.getData('/app/config');
    assert.strictEqual(data.data.toString('utf8'), '{"a":1}');
    assert.strictEqual(data.stat.dataLength, 7);
    assert.strictEqual(data.stat.numChildren, 0);
  });

  it('rejects duplicate and parent-less nodes', async () => {
    await client.create('/app', Buffer.alloc(0), 'PERSISTENT');
    await expectZkError(client.create('/app', Buffer.alloc(0), 'PERSISTENT'), ZkErrorCode.NODE_EXISTS);
    await expectZkError(client.create('/missing/child', Buffer.alloc(0), 'PERSISTENT'), ZkErrorCode.NO_NODE);
  });

  it('creates sequential nodes with unique zero-padded names', async () => {
    await client.create('/app', Buffer.alloc(0), 'PERSISTENT');
    const first = await client.create('/app/seq-', Buffer.alloc(0), 'PERSISTENT_SEQUENTIAL');
    const second = await client.create('/app/seq-', Buffer.alloc(0), 'PERSISTENT_SEQUENTIAL');
    assert.notStrictEqual(first, second);
    assert.match(first, /\/app\/seq-\d{10}$/);
    assert.strictEqual(await client.exists(first), true);
    assert.strictEqual(await client.exists(second), true);
  });

  it('updates data with optimistic version checks', async () => {
    await client.create('/n', Buffer.from('v1'), 'PERSISTENT');
    const before = await client.getData('/n');
    const version = before.stat.version;

    await client.setData('/n', Buffer.from('v2'), version);
    const after = await client.getData('/n');
    assert.strictEqual(after.data.toString('utf8'), 'v2');
    assert.strictEqual(after.stat.version, version + 1);

    await expectZkError(client.setData('/n', Buffer.from('v3'), version), ZkErrorCode.BAD_VERSION);
    await client.setData('/n', Buffer.from('v4'), -1);
    assert.strictEqual((await client.getData('/n')).data.toString('utf8'), 'v4');
  });

  it('removes empty nodes and rejects non-empty or missing ones', async () => {
    await client.create('/a', Buffer.alloc(0), 'PERSISTENT');
    await client.create('/a/b', Buffer.alloc(0), 'PERSISTENT');
    await expectZkError(client.remove('/a'), ZkErrorCode.NOT_EMPTY);
    await client.remove('/a/b');
    await client.remove('/a');
    assert.strictEqual(await client.exists('/a'), false);
    await expectZkError(client.remove('/a'), ZkErrorCode.NO_NODE);
  });

  it('disconnects and reports state changes', async () => {
    const states: string[] = [];
    client.onStateChange((state) => states.push(state));
    client.simulateDisconnect();
    assert.strictEqual(client.state, 'disconnected');
    assert.ok(states.includes('disconnected'));

    await client.connect();
    assert.strictEqual(client.state, 'connected');
    client.close();
    assert.strictEqual(client.state, 'closed');
    assert.strictEqual(client.closeCalls, 1);
  });
});
