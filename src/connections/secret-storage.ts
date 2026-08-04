export interface SecretStorageLike {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
}

/**
 * Namespaced wrapper over any SecretStorage-like implementation (VS Code's
 * SecretStorage or a test fake). Keeps secrets out of plain config files.
 *
 * Access is best-effort: on platforms without a keyring (e.g. Linux CI
 * runners) SecretStorage operations can throw; credentials are optional, so
 * failures degrade to "no password" instead of breaking the whole flow.
 */
export class SecretStorageWrapper implements SecretStorageLike {
  constructor(
    private readonly storage: SecretStorageLike,
    private readonly prefix = 'zkViewer.',
  ) {}

  async get(key: string): Promise<string | undefined> {
    try {
      return await this.storage.get(this.prefix + key);
    } catch {
      return undefined;
    }
  }

  async store(key: string, value: string): Promise<void> {
    try {
      await this.storage.store(this.prefix + key, value);
    } catch {
      // keep going; credentials are optional
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.storage.delete(this.prefix + key);
    } catch {
      // keep going; credentials are optional
    }
  }
}
