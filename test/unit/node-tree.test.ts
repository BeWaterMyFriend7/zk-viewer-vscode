import * as assert from 'assert';
import { MockZkClient } from '../../src/zk/mock-zk';
import { listChildDescriptors, sortDescriptors, type ZkNodeDescriptor } from '../../src/tree/node-tree';

function descriptor(name: string): ZkNodeDescriptor {
  return { path: `/${name}`, name, type: 'persistent', collapsibleState: 'collapsed' };
}

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

  it('sorts a level by name ascending, descending or keeps server order', async () => {
    const client = new MockZkClient();
    await client.connect();
    await client.create('/zeta', Buffer.alloc(0), 'PERSISTENT');
    await client.create('/alpha', Buffer.alloc(0), 'PERSISTENT');
    await client.create('/Mike', Buffer.alloc(0), 'PERSISTENT');
    await client.create('/beta', Buffer.alloc(0), 'PERSISTENT');

    const asc = await listChildDescriptors(client, '/', 'name');
    const desc = await listChildDescriptors(client, '/', 'name-desc');
    const none = await listChildDescriptors(client, '/', 'none');

    assert.deepStrictEqual(
      asc.map((d) => d.name),
      ['alpha', 'beta', 'Mike', 'zeta'],
      'name sort is case-insensitive ascending',
    );
    assert.deepStrictEqual(
      desc.map((d) => d.name),
      ['zeta', 'Mike', 'beta', 'alpha'],
    );
    assert.deepStrictEqual(
      none.map((d) => d.name),
      ['zeta', 'alpha', 'Mike', 'beta'],
      'server order keeps the creation order',
    );
  });
});

describe('sortDescriptors', () => {
  it('returns a new array and leaves the input untouched', () => {
    const input = [descriptor('b'), descriptor('a')];
    const sorted = sortDescriptors(input, 'name');
    assert.deepStrictEqual(
      sorted.map((d) => d.name),
      ['a', 'b'],
    );
    assert.deepStrictEqual(
      input.map((d) => d.name),
      ['b', 'a'],
    );
  });

  it('keeps server order for "none"', () => {
    const input = [descriptor('z'), descriptor('a')];
    assert.strictEqual(sortDescriptors(input, 'none'), input);
  });
});
