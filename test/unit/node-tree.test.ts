import * as assert from 'assert';
import { MockZkClient } from '../../src/zk/mock-zk';
import { listChildDescriptors } from '../../src/tree/node-tree';

describe('listChildDescriptors', () => {
  it('loads only the requested level of children', async () => {
    const client = new MockZkClient();
    await client.connect();
    await client.create('/app', Buffer.alloc(0), 'PERSISTENT');
    await client.create('/app/config', Buffer.from('{}'), 'PERSISTENT');
    await client.create('/app/session-1', Buffer.alloc(0), 'EPHEMERAL');

    const root = await listChildDescriptors(client, '/');
    assert.deepStrictEqual(
      root.map((d) => d.name),
      ['app'],
    );
    assert.strictEqual(root[0].type, 'persistent');

    const children = await listChildDescriptors(client, '/app');
    assert.deepStrictEqual(
      children.map((d) => d.name),
      ['config', 'session-1'],
    );
    assert.strictEqual(children[0].type, 'persistent');
    assert.strictEqual(children[1].type, 'ephemeral');

    assert.deepStrictEqual(client.childrenRequestLog, ['/', '/app']);
  });

  it('handles a missing child stat gracefully', async () => {
    const client = new MockZkClient();
    await client.connect();
    const descriptors = await listChildDescriptors(client, '/');
    assert.deepStrictEqual(descriptors, []);
  });
});
