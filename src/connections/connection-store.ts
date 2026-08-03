import type { SecretStorageLike } from './secret-storage';

export interface ConnectionConfig {
  id: string;
  name: string;
  hosts: string;
  chroot?: string;
  sessionTimeoutMs?: number;
  username?: string;
  secure?: boolean;
}

export interface KeyValueStorage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

const PASSWORD_KEY_PREFIX = 'connection.';

export class ConnectionStore {
  constructor(
    private readonly workspace: KeyValueStorage,
    private readonly secrets: SecretStorageLike,
    private readonly configKey = 'zkViewer.connections',
  ) {}

  async list(): Promise<ConnectionConfig[]> {
    return this.readConfigs();
  }

  async get(id: string): Promise<ConnectionConfig | undefined> {
    return (await this.readConfigs()).find((config) => config.id === id);
  }

  async save(config: ConnectionConfig, password?: string): Promise<void> {
    const configs = await this.readConfigs();
    const index = configs.findIndex((existing) => existing.id === config.id);
    if (index >= 0) {
      configs[index] = config;
    } else {
      configs.push(config);
    }
    await this.workspace.update(this.configKey, configs);
    if (password !== undefined) {
      await this.secrets.store(PASSWORD_KEY_PREFIX + config.id, password);
    }
  }

  async remove(id: string): Promise<void> {
    const configs = await this.readConfigs();
    await this.workspace.update(
      this.configKey,
      configs.filter((config) => config.id !== id),
    );
    await this.secrets.delete(PASSWORD_KEY_PREFIX + id);
  }

  async getPassword(id: string): Promise<string | undefined> {
    return this.secrets.get(PASSWORD_KEY_PREFIX + id);
  }

  async clear(): Promise<void> {
    await this.workspace.update(this.configKey, []);
  }

  private async readConfigs(): Promise<ConnectionConfig[]> {
    return this.workspace.get<ConnectionConfig[]>(this.configKey) ?? [];
  }
}

/**
 * Builds the connection string handed to node-zookeeper-client. TLS is
 * requested with the "ssl://" scheme prefix.
 */
export function buildZkConnectionString(config: ConnectionConfig): string {
  const base = config.hosts.trim();
  const suffix = config.chroot ? config.chroot : '';
  return config.secure ? `ssl://${base}${suffix}` : `${base}${suffix}`;
}
