export interface SecretStorageLike {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
}

/**
 * Namespaced wrapper over any SecretStorage-like implementation (VS Code's
 * SecretStorage or a test fake). Keeps secrets out of plain config files.
 */
export class SecretStorageWrapper implements SecretStorageLike {
  constructor(
    private readonly storage: SecretStorageLike,
    private readonly prefix = 'zkViewer.',
  ) {}

  get(key: string): Thenable<string | undefined> {
    return this.storage.get(this.prefix + key);
  }

  store(key: string, value: string): Thenable<void> {
    return this.storage.store(this.prefix + key, value);
  }

  delete(key: string): Thenable<void> {
    return this.storage.delete(this.prefix + key);
  }
}
