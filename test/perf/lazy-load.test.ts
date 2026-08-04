import * as assert from 'assert';
import { MockZkClient } from '../../src/zk/mock-zk';
import { listChildDescriptors } from '../../src/tree/node-tree';
import { searchNodes } from '../../src/search/node-search';

describe('lazy loading performance', () => {
  it('loads a 500-child level in under 500ms with only the expanded level requested', async () => {
    const client = new MockZkClient();
    await client.connect();
    await client.create('/big', Buffer.alloc(0), 'PERSISTENT');
    for (let i = 0; i < 500; i += 1) {
      await client.create(`/big/node-${i}`, Buffer.alloc(0), 'PERSISTENT');
    }

    const start = Date.now();
    const descriptors = await listChildDescriptors(client, '/big');
    const elapsed = Date.now() - start;

    assert.strictEqual(descriptors.length, 500);
    assert.ok(elapsed < 500, `listing 500 children took ${elapsed}ms`);
    assert.deepStrictEqual(client.childrenRequestLog, ['/big'], 'only the expanded level should be fetched');
  });

  it('does not fetch unexpanded subtrees', async () => {
    const client = new MockZkClient();
    await client.connect();
    await client.create('/a', Buffer.alloc(0), 'PERSISTENT');
    await client.create('/a/b', Buffer.alloc(0), 'PERSISTENT');
    await client.create('/a/b/c', Buffer.alloc(0), 'PERSISTENT');

    await listChildDescriptors(client, '/a');

    assert.deepStrictEqual(client.childrenRequestLog, ['/a'], 'descendants must not be fetched');
  });

  it('searches 500 nodes with content matching in under 2s', async () => {
    const client = new MockZkClient();
    await client.connect();
    await client.create('/big', Buffer.alloc(0), 'PERSISTENT');
    for (let i = 0; i < 500; i += 1) {
      await client.create(`/big/node-${i}`, Buffer.from(`{"id":${i},"needle":"x"}`), 'PERSISTENT');
    }

    const start = Date.now();
    const results = await searchNodes(client, { mode: 'content', query: 'needle' });
    const elapsed = Date.now() - start;

    assert.strictEqual(results.length, 500);
    assert.ok(elapsed < 2000, `content search over 500 nodes took ${elapsed}ms`);
  });
});
