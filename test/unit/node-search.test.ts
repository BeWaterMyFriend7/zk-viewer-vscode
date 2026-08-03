import * as assert from 'assert';
import { MockZkClient } from '../../src/zk/mock-zk';
import { searchNodes } from '../../src/search/node-search';

async function seedTree(): Promise<MockZkClient> {
  const client = new MockZkClient();
  await client.connect();
  await client.create('/app', Buffer.alloc(0), 'PERSISTENT');
  await client.create('/app/config', Buffer.from('{"role":"web"}'), 'PERSISTENT');
  await client.create('/app/session-1', Buffer.alloc(0), 'EPHEMERAL');
  await client.create('/app/x', Buffer.alloc(0), 'PERSISTENT');
  await client.create('/app/x/config', Buffer.from('{}'), 'PERSISTENT');
  await client.create('/svc-1', Buffer.from('{"svc":"web"}'), 'PERSISTENT');
  await client.create('/svc-2', Buffer.alloc(0), 'PERSISTENT');
  return client;
}

describe('searchNodes', () => {
  it('matches by name prefix', async () => {
    const client = await seedTree();
    const results = await searchNodes(client, { mode: 'prefix', query: 'config' });
    assert.deepStrictEqual(
      results.map((r) => r.path),
      ['/app/config', '/app/x/config'],
    );
    assert.ok(results.every((r) => r.matchedBy === 'name'));
  });

  it('matches path wildcards', async () => {
    const client = await seedTree();
    const results = await searchNodes(client, { mode: 'wildcard', query: '/app/*/config' });
    assert.deepStrictEqual(
      results.map((r) => r.path),
      ['/app/x/config'],
    );
  });

  it('matches path regexes', async () => {
    const client = await seedTree();
    const results = await searchNodes(client, { mode: 'regex', query: '^/svc-\\d+$' });
    assert.deepStrictEqual(
      results.map((r) => r.path),
      ['/svc-1', '/svc-2'],
    );
  });

  it('matches node content within a subtree', async () => {
    const client = await seedTree();
    const results = await searchNodes(client, { mode: 'content', query: 'role', subtree: '/app' });
    assert.deepStrictEqual(
      results.map((r) => r.path),
      ['/app/config'],
    );
    assert.strictEqual(results[0].matchedBy, 'content');
  });

  it('honors the maxNodes traversal bound', async () => {
    const client = await seedTree();
    const results = await searchNodes(client, { mode: 'regex', query: '^/svc-\\d+$', maxNodes: 2 });
    assert.ok(results.length <= 2);
  });

  it('returns no results when nothing matches', async () => {
    const client = await seedTree();
    assert.deepStrictEqual(await searchNodes(client, { mode: 'prefix', query: 'nope' }), []);
  });
});
