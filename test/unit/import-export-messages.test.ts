import * as assert from 'assert';
import { getImportExportMessages } from '../../src/i18n/import-export-messages';

describe('import/export messages', () => {
  it('provides Chinese text for Chinese VS Code locales', () => {
    const messages = getImportExportMessages('zh-cn');
    assert.strictEqual(messages.importButton, '导入节点数据...');
    assert.match(messages.importSuccess({ created: 2, updated: 1, skipped: 0 }), /已导入/);
    assert.match(messages.exportProgress('/app', true), /正在导出/);
  });

  it('provides English text for English and unsupported VS Code locales', () => {
    assert.strictEqual(getImportExportMessages('en').importButton, 'Import Node Data...');
    assert.strictEqual(getImportExportMessages('en-us').overwriteLabel, 'Overwrite existing nodes');
    assert.strictEqual(getImportExportMessages('fr').skipLabel, 'Skip existing nodes');
  });
});
