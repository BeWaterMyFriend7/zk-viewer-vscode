import * as assert from 'assert';
import { detectNodeType, iconForType, isSequentialName, type NodeType } from '../../src/tree/node-model';

const persistentStat = { ephemeralOwner: '0x0' };
const ephemeralStat = { ephemeralOwner: '0x1a2b3c' };

describe('node model', () => {
  it('detects the four node types from stat and name', () => {
    assert.strictEqual(detectNodeType(persistentStat, 'config'), 'persistent');
    assert.strictEqual(detectNodeType(ephemeralStat, 'session-1'), 'ephemeral');
    assert.strictEqual(detectNodeType(persistentStat, 'seq-0000000001'), 'persistent_sequential');
    assert.strictEqual(detectNodeType(ephemeralStat, 'seq-0000000002'), 'ephemeral_sequential');
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
      assert.match(icon, /^symbol-/);
    }
  });
});
