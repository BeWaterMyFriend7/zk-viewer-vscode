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
  it('locates a node by its exact path', async () => {
    const client = await seedTree();
    const outcome = await searchNodes(client, { mode: 'exact', query: '/app/config' });
    assert.deepStrictEqual(
      outcome.results.map((r) => r.path),
      ['/app/config'],
    );
    assert.strictEqual(outcome.truncated, false);
  });

  it('normalizes trailing slashes for exact path lookup', async () => {
    const client = await seedTree();
    const outcome = await searchNodes(client, { mode: 'exact', query: '/app/config/' });
    assert.deepStrictEqual(
      outcome.results.map((r) => r.path),
      ['/app/config'],
    );
  });

  it('returns no results for an exact path that does not exist', async () => {
    const client = await seedTree();
    const outcome = await searchNodes(client, { mode: 'exact', query: '/missing/node' });
    assert.deepStrictEqual(outcome.results, []);
    assert.strictEqual(outcome.truncated, false);
  });

  it('matches by name prefix', async () => {
    const client = await seedTree();
    const { results } = await searchNodes(client, { mode: 'prefix', query: 'config' });
    assert.deepStrictEqual(
      results.map((r) => r.path),
      ['/app/config', '/app/x/config'],
    );
    assert.ok(results.every((r) => r.matchedBy === 'name'));
    assert.strictEqual(results.length, 2);
  });

  it('matches path wildcards', async () => {
    const client = await seedTree();
    const { results } = await searchNodes(client, { mode: 'wildcard', query: '/app/*/config' });
    assert.deepStrictEqual(
      results.map((r) => r.path),
      ['/app/x/config'],
    );
  });

  it('matches path regexes', async () => {
    const client = await seedTree();
    const { results } = await searchNodes(client, { mode: 'regex', query: '^/svc-\\d+$' });
    assert.deepStrictEqual(
      results.map((r) => r.path),
      ['/svc-1', '/svc-2'],
    );
  });

  it('matches text contained anywhere in a full path', async () => {
    const client = new MockZkClient();
    await client.connect();
    await client.create('/sg', Buffer.alloc(0), 'PERSISTENT');
    await client.create('/sg/abc', Buffer.alloc(0), 'PERSISTENT');
    await client.create('/sg/abc/192.168.126.100:28080', Buffer.alloc(0), 'PERSISTENT');
    await client.create('/sg/abc/192.168.126.100:28080/1.0', Buffer.alloc(0), 'PERSISTENT');

    const { results } = await searchNodes(client, { mode: 'contains', query: '168' });

    assert.deepStrictEqual(
      results.map((r) => r.path),
      ['/sg/abc/192.168.126.100:28080', '/sg/abc/192.168.126.100:28080/1.0'],
    );
    assert.ok(results.every((result) => result.matchedBy === 'path'));

    const noCaseFold = await searchNodes(client, { mode: 'contains', query: 'SG' });
    assert.deepStrictEqual(noCaseFold.results, [], 'ZooKeeper path matching should remain case-sensitive');
  });

  it('matches node content within a subtree', async () => {
    const client = await seedTree();
    const { results } = await searchNodes(client, { mode: 'content', query: 'role', subtree: '/app' });
    assert.deepStrictEqual(
      results.map((r) => r.path),
      ['/app/config'],
    );
    assert.strictEqual(results[0].matchedBy, 'content');
  });

  it('marks the outcome truncated when the traversal hits the cap', async () => {
    const client = await seedTree();
    const outcome = await searchNodes(client, { mode: 'regex', query: '^/svc-\\d+$', maxNodes: 2 });
    assert.ok(outcome.results.length <= 2);
    assert.strictEqual(outcome.truncated, true, 'small cap must mark the search as truncated');
    assert.strictEqual(outcome.visitedNodes, 2);
  });

  it('returns no results when nothing matches', async () => {
    const client = await seedTree();
    const outcome = await searchNodes(client, { mode: 'prefix', query: 'nope' });
    assert.deepStrictEqual(outcome.results, []);
    assert.strictEqual(outcome.truncated, false);
  });

  it('skips oversized nodes only when a size limit is configured', async () => {
    const client = new MockZkClient();
    await client.connect();
    await client.create('/empty', Buffer.alloc(0), 'PERSISTENT');
    await client.create('/small', Buffer.from('target'), 'PERSISTENT');
    await client.create('/huge', Buffer.from(`x${'target'.repeat(200)}`), 'PERSISTENT');

    const limited = await searchNodes(client, {
      mode: 'content',
      query: 'target',
      maxDataBytes: 64,
    });
    assert.deepStrictEqual(
      limited.results.map((r) => r.path),
      ['/small'],
    );
    assert.strictEqual(limited.oversizedSkipped, 1);

    const unlimited = await searchNodes(client, { mode: 'content', query: 'target' });
    assert.deepStrictEqual(
      unlimited.results.map((r) => r.path),
      ['/huge', '/small'],
      'default (no limit) must return matches from large nodes too',
    );
    assert.strictEqual(unlimited.oversizedSkipped, 0);
  });

  it('honors the concurrency window without losing results', async () => {
    const client = new MockZkClient();
    await client.connect();
    await client.create('/app', Buffer.alloc(0), 'PERSISTENT');
    for (let i = 0; i < 50; i += 1) {
      await client.create(`/app/n-${i}`, Buffer.alloc(0), 'PERSISTENT');
    }
    const serial = await searchNodes(client, { mode: 'prefix', query: 'n-', concurrency: 1 });
    const parallel = await searchNodes(client, { mode: 'prefix', query: 'n-', concurrency: 8 });
    assert.deepStrictEqual(parallel.results, serial.results, 'parallel traversal must match serial results');
    assert.strictEqual(parallel.truncated, false);
  });

  it('returns every match in a wide tree with a sufficient cap', async () => {
    const client = new MockZkClient();
    await client.connect();
    // 60 directories, each containing 10 matching config nodes: 600 matches
    // spread across two levels - a cap of 2000 would have dropped most of them.
    for (let i = 0; i < 60; i += 1) {
      await client.create(`/svc-${i}`, Buffer.alloc(0), 'PERSISTENT');
      for (let j = 0; j < 10; j += 1) {
        await client.create(`/svc-${i}/config-${j}`, Buffer.alloc(0), 'PERSISTENT');
      }
    }
    const outcome = await searchNodes(client, { mode: 'prefix', query: 'config-' });
    assert.strictEqual(outcome.results.length, 600, 'all matches must be returned');
    assert.strictEqual(outcome.truncated, false);
    assert.ok(outcome.visitedNodes > 600);
  });

  it('treats maxNodes 0 as unlimited', async () => {
    const client = new MockZkClient();
    await client.connect();
    for (let i = 0; i < 30; i += 1) {
      await client.create(`/n-${i}`, Buffer.alloc(0), 'PERSISTENT');
    }
    const outcome = await searchNodes(client, { mode: 'prefix', query: 'n-', maxNodes: 0 });
    assert.strictEqual(outcome.results.length, 30);
    assert.strictEqual(outcome.truncated, false);
    assert.strictEqual(outcome.visitedNodes, 31);
  });

  it('reports cancellation', async () => {
    const client = new MockZkClient();
    await client.connect();
    for (let i = 0; i < 20; i += 1) {
      await client.create(`/n-${i}`, Buffer.alloc(0), 'PERSISTENT');
    }
    let cancelled = false;
    const outcome = await searchNodes(client, {
      mode: 'prefix',
      query: 'n-',
      isCancelled: () => cancelled,
    });
    assert.strictEqual(outcome.cancelled, false);

    cancelled = true;
    const cancelledOutcome = await searchNodes(client, {
      mode: 'prefix',
      query: 'n-',
      isCancelled: () => cancelled,
    });
    assert.strictEqual(cancelledOutcome.cancelled, true);
    assert.strictEqual(cancelledOutcome.results.length, 0);
  });
});
