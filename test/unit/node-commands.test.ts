import * as assert from 'assert';
import { MockZkClient } from '../../src/zk/mock-zk';
import { deleteNodeRecursively, validateNodeName } from '../../src/commands/node-commands';

describe('node commands', () => {
  it('validates node names', () => {
    assert.strictEqual(validateNodeName('config'), undefined);
    assert.match(validateNodeName('') ?? '', /empty/);
    assert.match(validateNodeName('a/b') ?? '', /"\/"/);
    assert.match(validateNodeName('.') ?? '', /"\.\."/);
    assert.match(validateNodeName('..') ?? '', /"\.\."/);
  });

  it('deletes a subtree leaf-first', async () => {
    const client = new MockZkClient();
    await client.connect();
    await client.create('/a', Buffer.alloc(0), 'PERSISTENT');
    await client.create('/a/b', Buffer.alloc(0), 'PERSISTENT');
    await client.create('/a/b/c', Buffer.alloc(0), 'PERSISTENT');
    await client.create('/a/x', Buffer.alloc(0), 'PERSISTENT');

    await deleteNodeRecursively(client, '/a');

    assert.strictEqual(await client.exists('/a'), false);
    assert.strictEqual(client.removalLog[client.removalLog.length - 1], '/a', 'parent must be removed last');
    const indexOf = (path: string) => client.removalLog.indexOf(path);
    assert.ok(indexOf('/a/b/c') >= 0 && indexOf('/a/b') >= 0 && indexOf('/a/x') >= 0);
    assert.ok(indexOf('/a/b/c') < indexOf('/a/b'), 'child must be removed before its parent');
    assert.ok(indexOf('/a/b') < indexOf('/a'), 'child must be removed before its parent');
    assert.ok(indexOf('/a/x') < indexOf('/a'), 'child must be removed before its parent');
  });

  it('deletes a single empty node', async () => {
    const client = new MockZkClient();
    await client.connect();
    await client.create('/single', Buffer.alloc(0), 'PERSISTENT');
    await deleteNodeRecursively(client, '/single');
    assert.strictEqual(await client.exists('/single'), false);
    assert.deepStrictEqual(client.removalLog, ['/single']);
  });
});
