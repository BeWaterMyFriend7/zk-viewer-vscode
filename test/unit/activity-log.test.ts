import * as assert from 'assert';
import { clearLog, getLogEntries, log, onLogChange } from '../../src/log/activity-log';

describe('activity log', () => {
  beforeEach(() => {
    clearLog();
  });

  it('records entries with time, level and message', () => {
    log('Connected');
    log('Save failed', 'error');
    const entries = getLogEntries();
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[0].level, 'info');
    assert.strictEqual(entries[0].message, 'Connected');
    assert.strictEqual(entries[1].level, 'error');
    assert.match(entries[0].time, /^\d{4}-\d{2}-\d{2}T/);
  });

  it('notifies listeners on change and supports clear', () => {
    let seen = 0;
    const unsubscribe = onLogChange((entries) => {
      seen = entries.length;
    });
    log('one');
    assert.strictEqual(seen, 1);
    clearLog();
    assert.strictEqual(seen, 0);
    assert.deepStrictEqual(getLogEntries(), []);
    unsubscribe();
    log('two');
    assert.strictEqual(seen, 0, 'unsubscribed listeners must not fire');
  });
});
