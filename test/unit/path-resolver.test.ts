import * as assert from 'assert';
import { MockZkClient } from '../../src/zk/mock-zk';
import { ZkError, ZkErrorCode } from '../../src/zk/zk-client';
import { normalizePath, resolvePath } from '../../src/search/path-resolver';

describe('path resolver', () => {
  it('normalizes paths', () => {
    assert.strictEqual(normalizePath('/app/config'), '/app/config');
    assert.strictEqual(normalizePath('/app//config'), '/app/config');
    assert.strictEqual(normalizePath('/app/'), '/app');
    assert.strictEqual(normalizePath(''), '/');
    assert.strictEqual(normalizePath('  /  '), '/');
    assert.throws(() => normalizePath('app/config'), /must start with "\/"/);
  });

  it('resolves existing paths and rejects missing ones', async () => {
    const client = new MockZkClient();
    await client.connect();
    await client.create('/app', Buffer.alloc(0), 'PERSISTENT');

    assert.strictEqual(await resolvePath(client, ' /app '), '/app');
    try {
      await resolvePath(client, '/missing');
      assert.fail('expected NO_NODE error');
    } catch (err) {
      assert.ok(err instanceof ZkError);
      assert.strictEqual((err as ZkError).code, ZkErrorCode.NO_NODE);
    }
  });
});
