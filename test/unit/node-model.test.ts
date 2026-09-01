import * as assert from 'assert';
import {
  detectNodeType,
  iconForType,
  iconColorForType,
  isSequentialName,
  isZeroId,
  type NodeType,
} from '../../src/tree/node-model';

const persistentStat = { ephemeralOwner: '0x0' };
const ephemeralStat = { ephemeralOwner: '0x1a2b3c' };

describe('node model', () => {
  it('detects the four node types from stat and name', () => {
    assert.strictEqual(detectNodeType(persistentStat, 'config'), 'persistent');
    assert.strictEqual(detectNodeType(ephemeralStat, 'session-1'), 'ephemeral');
    assert.strictEqual(detectNodeType(persistentStat, 'seq-0000000001'), 'persistent_sequential');
    assert.strictEqual(detectNodeType(ephemeralStat, 'seq-0000000002'), 'ephemeral_sequential');
  });

  it('treats zero-padded and empty owners as persistent', () => {
    assert.strictEqual(detectNodeType({ ephemeralOwner: '0x0000000000000000' }, 'config'), 'persistent');
    assert.strictEqual(detectNodeType({ ephemeralOwner: '0x0' }, 'config'), 'persistent');
    assert.strictEqual(detectNodeType({ ephemeralOwner: '0' }, 'config'), 'persistent');
  });

  it('recognizes zero ids in multiple representations', () => {
    assert.strictEqual(isZeroId('0x0'), true);
    assert.strictEqual(isZeroId('0x0000000000000000'), true);
    assert.strictEqual(isZeroId('0'), true);
    assert.strictEqual(isZeroId(''), true);
    assert.strictEqual(isZeroId(undefined), true);
    assert.strictEqual(isZeroId('0x1a2b3c'), false);
  });

  it('recognizes sequential name suffixes', () => {
    assert.strictEqual(isSequentialName('node-0000000042'), true);
    assert.strictEqual(isSequentialName('node-42'), false);
    assert.strictEqual(isSequentialName('plain'), false);
  });

  it('maps every node type to a distinct codicon', () => {
    const types: NodeType[] = ['persistent', 'persistent_sequential', 'ephemeral', 'ephemeral_sequential'];
    const icons = types.map((type) => iconForType(type));
    assert.strictEqual(new Set(icons).size, 4, 'each type needs a distinct icon');
    for (const icon of icons) {
      assert.ok(icon.length > 0, 'each icon must be a non-empty codicon id');
    }
  });

  it('uses a file icon for a leaf persistent node and a folder for a branch', () => {
    assert.strictEqual(iconForType('persistent', true), 'file');
    assert.strictEqual(iconForType('persistent', false), 'folder');
    assert.strictEqual(iconForType('persistent_sequential', true), 'list-ordered');
    assert.strictEqual(iconForType('ephemeral', true), 'pulse');
  });

  it('returns a distinct theme color key for each node type', () => {
    assert.strictEqual(iconColorForType('persistent', true), 'zkViewer.icon.file');
    assert.strictEqual(iconColorForType('persistent', false), 'zkViewer.icon.folder');
    assert.strictEqual(iconColorForType('persistent_sequential', false), 'zkViewer.icon.sequential');
    assert.strictEqual(iconColorForType('ephemeral', false), 'zkViewer.icon.ephemeral');
    assert.strictEqual(iconColorForType('ephemeral_sequential', false), 'zkViewer.icon.ephemeralSequential');
  });
});
