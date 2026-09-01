import type { ZnodeStat } from '../zk/zk-client';

export type NodeType = 'persistent' | 'persistent_sequential' | 'ephemeral' | 'ephemeral_sequential';

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
      // Use non 'symbol-*' codicons so the ThemeColor is not overridden by the
      // codicon's !important CSS rule, which affects the symbol-* product icons.
      return isLeaf ? 'file' : 'folder';
    case 'persistent_sequential':
      return 'list-ordered';
    case 'ephemeral':
      return 'pulse';
    case 'ephemeral_sequential':
      return 'plug';
  }
}

/**
 * Optional VS Code ThemeColor key to tint the tree icon so leaves, branches
 * and node types are visually distinct. Keys come from the built-in color
 * registry; unsupported keys fall back to the default icon color.
 */
export function iconColorForType(type: NodeType, isLeaf = false): string | undefined {
  switch (type) {
    case 'persistent':
      return isLeaf ? 'zkViewer.icon.file' : 'zkViewer.icon.folder';
    case 'persistent_sequential':
      return 'zkViewer.icon.sequential';
    case 'ephemeral':
      return 'zkViewer.icon.ephemeral';
    case 'ephemeral_sequential':
      return 'zkViewer.icon.ephemeralSequential';
  }
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
