import type { ZnodeStat } from '../zk/zk-client';

export type NodeType = 'persistent' | 'persistent_sequential' | 'ephemeral' | 'ephemeral_sequential';

export function isSequentialName(name: string): boolean {
  return /-\d{10}$/.test(name);
}

export function detectNodeType(stat: Pick<ZnodeStat, 'ephemeralOwner'>, name: string): NodeType {
  const ephemeral = stat.ephemeralOwner !== '0x0';
  const sequential = isSequentialName(name);
  if (ephemeral) {
    return sequential ? 'ephemeral_sequential' : 'ephemeral';
  }
  return sequential ? 'persistent_sequential' : 'persistent';
}

export function iconForType(type: NodeType): string {
  switch (type) {
    case 'persistent':
      return 'symbol-folder';
    case 'persistent_sequential':
      return 'symbol-structure';
    case 'ephemeral':
      return 'symbol-event';
    case 'ephemeral_sequential':
      return 'symbol-class';
  }
}
