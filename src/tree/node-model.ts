import type { ZnodeStat } from '../zk/zk-client';

export type NodeType = 'persistent' | 'persistent_sequential' | 'ephemeral' | 'ephemeral_sequential';

export const NODE_ICON_COLOR = '#D4A72C';

export function isSequentialName(name: string): boolean {
  return /-\d{10}$/.test(name);
}

export function detectNodeType(stat: Pick<ZnodeStat, 'ephemeralOwner'>, name: string): NodeType {
  // The native client returns ephemeralOwner as an 8-byte big-endian long. A
  // plain persistent node has owner 0, which may appear as '0x0', '0', or a
  // zero-padded hex like '0x0000000000000000'. Treat any ownership value that
  // parses to zero as non-ephemeral so persistent nodes get a folder/file icon.
  const ephemeral = !isZeroId(stat.ephemeralOwner);
  const sequential = isSequentialName(name);
  if (ephemeral) {
    return sequential ? 'ephemeral_sequential' : 'ephemeral';
  }
  return sequential ? 'persistent_sequential' : 'persistent';
}

/**
 * Maps a node to a codicon. Plain persistent nodes use a folder/file glyph
 * based on whether they have children (isLeaf), so a tree reads at a glance.
 * Ephemeral and sequential nodes keep their dedicated type icons.
 */
export function iconForType(type: NodeType, isLeaf = false): string {
  switch (type) {
    case 'persistent':
      return isLeaf ? 'symbol-file' : 'symbol-folder';
    case 'persistent_sequential':
      return 'symbol-structure';
    case 'ephemeral':
      return 'symbol-event';
    case 'ephemeral_sequential':
      return 'symbol-class';
  }
}

export function iconAssetForType(type: NodeType, isLeaf = false): string {
  switch (type) {
    case 'persistent':
      return isLeaf ? 'node-file.svg' : 'node-folder.svg';
    case 'persistent_sequential':
      return 'node-sequential.svg';
    case 'ephemeral':
      return 'node-ephemeral.svg';
    case 'ephemeral_sequential':
      return 'node-ephemeral-sequential.svg';
  }
}

/**
 * All node SVG assets intentionally use one fixed color. This keeps the tree
 * visible when the active VS Code theme renders codicons in gray.
 */
export function iconColorForType(_type: NodeType, _isLeaf = false): string {
  return NODE_ICON_COLOR;
}

/**
 * True when an ephemeralOwner string represents a zero (i.e. a persistent
 * node). Accepts plain numbers, '0x' hex with or without leading zeros, and
 * an empty/undefined owner which is also treated as non-ephemeral.
 */
export function isZeroId(value: string | undefined): boolean {
  if (value === undefined || value === '' || value === '0') {
    return true;
  }
  if (value.startsWith('0x') || value.startsWith('0X')) {
    const hex = value.slice(2);
    return /^0*$/.test(hex);
  }
  const num = Number(value);
  return Number.isFinite(num) && num === 0;
}
