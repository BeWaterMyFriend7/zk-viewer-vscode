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

export type ConnectionMigrationRunner = (task: () => Promise<void>) => Promise<void>;

const PASSWORD_KEY_PREFIX = 'connection.';
const CONNECTIONS_KEY = 'zkViewer.connections';
const WORKSPACE_MIGRATION_KEY = 'zkViewer.connectionsMigratedToGlobal.v1';
const MAX_MIGRATION_MERGE_ATTEMPTS = 3;

function sanitizeConnectionConfig(config: ConnectionConfig): ConnectionConfig {
  return {
    id: config.id,
    name: config.name,
    hosts: config.hosts,
    ...(config.chroot !== undefined ? { chroot: config.chroot } : {}),
    ...(config.sessionTimeoutMs !== undefined ? { sessionTimeoutMs: config.sessionTimeoutMs } : {}),
    ...(config.username !== undefined ? { username: config.username } : {}),
    ...(config.secure !== undefined ? { secure: config.secure } : {}),
  };
}

function migrationIdentity(config: ConnectionConfig): string {
  const hosts = config.hosts
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .join(',');
  return JSON.stringify([hosts, config.username?.trim() ?? '']);
}

function findMissingLegacyConfigs(
  globalConfigs: ConnectionConfig[],
  legacyConfigs: ConnectionConfig[],
): ConnectionConfig[] {
  const knownIds = new Set(globalConfigs.map((config) => config.id));
  const knownIdentities = new Set(globalConfigs.map(migrationIdentity));
  return legacyConfigs.filter((config) => {
    const identity = migrationIdentity(config);
    if (knownIds.has(config.id) || knownIdentities.has(identity)) {
      return false;
    }
    knownIds.add(config.id);
    knownIdentities.add(identity);
    return true;
  });
}

export class ConnectionStore {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly secrets: SecretStorageLike,
    private readonly configKey = CONNECTIONS_KEY,
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
    await this.storage.update(this.configKey, configs);
    if (password !== undefined) {
      await this.secrets.store(PASSWORD_KEY_PREFIX + config.id, password);
    }
  }

  async remove(id: string): Promise<void> {
    const configs = await this.readConfigs();
    await this.storage.update(
      this.configKey,
      configs.filter((config) => config.id !== id),
    );
    await this.secrets.delete(PASSWORD_KEY_PREFIX + id);
  }

  async getPassword(id: string): Promise<string | undefined> {
    return this.secrets.get(PASSWORD_KEY_PREFIX + id);
  }

  async clear(): Promise<void> {
    await this.storage.update(this.configKey, []);
  }

  private async readConfigs(): Promise<ConnectionConfig[]> {
    return this.storage.get<ConnectionConfig[]>(this.configKey) ?? [];
  }
}

export async function initializeConnectionStore(
  globalState: KeyValueStorage,
  workspaceState: KeyValueStorage,
  secrets: SecretStorageLike,
  runMigration: ConnectionMigrationRunner = async (task) => task(),
): Promise<ConnectionStore> {
  if (!workspaceState.get<boolean>(WORKSPACE_MIGRATION_KEY)) {
    const legacyConfigs = (workspaceState.get<ConnectionConfig[]>(CONNECTIONS_KEY) ?? []).map(
      sanitizeConnectionConfig,
    );
    const migrate = async (): Promise<void> => {
      for (let attempt = 0; attempt < MAX_MIGRATION_MERGE_ATTEMPTS; attempt += 1) {
        const globalConfigs = globalState.get<ConnectionConfig[]>(CONNECTIONS_KEY) ?? [];
        const missing = findMissingLegacyConfigs(globalConfigs, legacyConfigs);
        if (missing.length === 0) {
          break;
        }
        await globalState.update(CONNECTIONS_KEY, [...globalConfigs, ...missing]);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      const finalGlobalConfigs = globalState.get<ConnectionConfig[]>(CONNECTIONS_KEY) ?? [];
      if (findMissingLegacyConfigs(finalGlobalConfigs, legacyConfigs).length > 0) {
        throw new Error('Unable to migrate all saved ZooKeeper connections');
      }
      await workspaceState.update(WORKSPACE_MIGRATION_KEY, true);
    };
    if (legacyConfigs.length > 0) {
      await runMigration(migrate);
    } else {
      await workspaceState.update(WORKSPACE_MIGRATION_KEY, true);
    }
  }
  return new ConnectionStore(globalState, secrets);
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
