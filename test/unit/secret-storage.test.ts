import * as assert from 'assert';
import { SecretStorageWrapper, type SecretStorageLike } from '../../src/connections/secret-storage';

class FakeSecretStorage implements SecretStorageLike {
  readonly data = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.data.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

describe('SecretStorageWrapper', () => {
  let fake: FakeSecretStorage;
  let wrapper: SecretStorageWrapper;

  beforeEach(() => {
    fake = new FakeSecretStorage();
    wrapper = new SecretStorageWrapper(fake, 'zkViewer.');
  });

  it('round-trips set/get/delete with the configured prefix', async () => {
    await wrapper.store('connection.c1', 'pw');
    assert.strictEqual(await wrapper.get('connection.c1'), 'pw');
    assert.strictEqual(fake.data.get('zkViewer.connection.c1'), 'pw');

    await wrapper.delete('connection.c1');
    assert.strictEqual(await wrapper.get('connection.c1'), undefined);
    assert.strictEqual(fake.data.size, 0);
  });

  it('isolates keys by prefix', async () => {
    const other = new SecretStorageWrapper(fake, 'other.');
    await wrapper.store('a', '1');
    await other.store('a', '2');
    assert.strictEqual(await wrapper.get('a'), '1');
    assert.strictEqual(await other.get('a'), '2');
  });
});
