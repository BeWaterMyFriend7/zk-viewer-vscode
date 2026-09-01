import * as assert from 'assert';
import { MockZkClient } from '../../src/zk/mock-zk';
import {
  getParentDescriptor,
  listChildDescriptors,
  sortDescriptors,
  type ZkNodeDescriptor,
} from '../../src/tree/node-tree';

function descriptor(name: string): ZkNodeDescriptor {
  return { path: '/' + name, name, type: 'persistent', collapsibleState: 'collapsed', isLeaf: true };
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

describe('getParentDescriptor', () => {
  it('derives the parent path from the element path', () => {
    const child = getParentDescriptor({
      path: '/app/config',
      name: 'config',
      type: 'persistent',
      collapsibleState: 'collapsed',
      isLeaf: true,
    });
    assert.strictEqual(child?.path, '/app');
    assert.strictEqual(child?.name, 'app');
  });

  it('returns the root for a top-level node', () => {
    const parent = getParentDescriptor({
      path: '/app',
      name: 'app',
      type: 'persistent',
      collapsibleState: 'collapsed',
      isLeaf: true,
    });
    assert.strictEqual(parent?.path, '/');
  });

  it('returns undefined for the root itself', () => {
    const parent = getParentDescriptor({
      path: '/',
      name: '/',
      type: 'persistent',
      collapsibleState: 'collapsed',
      isLeaf: true,
    });
    assert.strictEqual(parent, undefined);
  });
});

describe('time-based tree sorting', () => {
  it('sorts by creation time using stat timestamps', async () => {
    const client = new MockZkClient();
    await client.connect();
    await client.create('/z1', Buffer.alloc(0), 'PERSISTENT');
    await client.create('/a2', Buffer.alloc(0), 'PERSISTENT');
    await client.create('/m3', Buffer.alloc(0), 'PERSISTENT');

    const createdAsc = await listChildDescriptors(client, '/', 'ctime');
    const createdDesc = await listChildDescriptors(client, '/', 'ctime-desc');

    assert.deepStrictEqual(
      createdAsc.map((d) => d.name),
      ['z1', 'a2', 'm3'],
      'creation time ascending follows creation order',
    );
    assert.deepStrictEqual(
      createdDesc.map((d) => d.name),
      ['m3', 'a2', 'z1'],
    );
  });

  it('sorts by modification time after updates', async () => {
    const client = new MockZkClient();
    await client.connect();
    await client.create('/z1', Buffer.alloc(0), 'PERSISTENT');
    await client.create('/a2', Buffer.alloc(0), 'PERSISTENT');
    await client.create('/m3', Buffer.alloc(0), 'PERSISTENT');

    await client.setData('/a2', Buffer.from('x'), 0);

    const modifiedAsc = await listChildDescriptors(client, '/', 'mtime');
    const modifiedDesc = await listChildDescriptors(client, '/', 'mtime-desc');

    assert.deepStrictEqual(
      modifiedAsc.map((d) => d.name),
      ['z1', 'm3', 'a2'],
      'modification time ascending puts the updated node last',
    );
    assert.deepStrictEqual(
      modifiedDesc.map((d) => d.name),
      ['a2', 'm3', 'z1'],
    );
  });

  it('falls back to server order when stat times are missing', async () => {
    const withoutTimes = [descriptor('b'), descriptor('a')];
    assert.deepStrictEqual(
      sortDescriptors(withoutTimes, 'ctime').map((d) => d.name),
      ['b', 'a'],
    );
  });
});
