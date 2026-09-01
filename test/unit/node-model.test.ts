import * as assert from 'assert';
import {
  detectNodeType,
  iconAssetForType,
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
      assert.match(icon, /^symbol-/, 'each icon should use the symbol-* family');
    }
  });

  it('uses a file icon for a leaf persistent node and a folder for a branch', () => {
    assert.strictEqual(iconForType('persistent', true), 'symbol-file');
    assert.strictEqual(iconForType('persistent', false), 'symbol-folder');
    assert.strictEqual(iconForType('persistent_sequential', true), 'symbol-structure');
    assert.strictEqual(iconForType('ephemeral', true), 'symbol-event');
  });

  it('maps node types to fixed-color icon assets', () => {
    assert.strictEqual(iconAssetForType('persistent', true), 'node-file.svg');
    assert.strictEqual(iconAssetForType('persistent', false), 'node-folder.svg');
    assert.strictEqual(iconAssetForType('persistent_sequential'), 'node-sequential.svg');
    assert.strictEqual(iconAssetForType('ephemeral'), 'node-ephemeral.svg');
    assert.strictEqual(iconAssetForType('ephemeral_sequential'), 'node-ephemeral-sequential.svg');
  });

  it('uses one fixed visible color for every node type', () => {
    const colors = [
      iconColorForType('persistent', true),
      iconColorForType('persistent', false),
      iconColorForType('persistent_sequential'),
      iconColorForType('ephemeral'),
      iconColorForType('ephemeral_sequential'),
    ];
    assert.deepStrictEqual(new Set(colors), new Set(['#D4A72C']));
  });
});
