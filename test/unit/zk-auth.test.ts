import * as assert from 'assert';
import { buildDigestAuth } from '../../src/zk/zk-client';

describe('buildDigestAuth', () => {
  it('builds a digest auth payload in user:password format', () => {
    const auth = buildDigestAuth('alice', 's3cret');
    assert.strictEqual(auth.scheme, 'digest');
    assert.strictEqual(auth.auth.toString('utf8'), 'alice:s3cret');
  });

  it('preserves special characters in credentials', () => {
    const auth = buildDigestAuth('user@corp', 'p@ss:w0rd');
    assert.strictEqual(auth.auth.toString('utf8'), 'user@corp:p@ss:w0rd');
  });
});
