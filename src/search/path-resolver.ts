import { ZkError, ZkErrorCode, type ZkClient } from '../zk/zk-client';

export function normalizePath(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return '/';
  }
  if (!trimmed.startsWith('/')) {
    throw new Error(`Invalid path "${input}": must start with "/"`);
  }
  const collapsed = trimmed.replace(/\/+/g, '/');
  return collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : '/';
}

export async function resolvePath(client: ZkClient, input: string): Promise<string> {
  const normalized = normalizePath(input);
  if (!(await client.exists(normalized))) {
    throw new ZkError(`Node not found: ${normalized}`, ZkErrorCode.NO_NODE);
  }
  return normalized;
}
