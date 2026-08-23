import * as assert from 'assert';
import { getImportExportMessages, resolveUiLanguage } from '../../src/i18n/import-export-messages';

describe('import/export messages', () => {
  it('resolves an explicit language or follows the VS Code display language', () => {
    assert.strictEqual(resolveUiLanguage('zh-cn', 'en'), 'zh-cn');
    assert.strictEqual(resolveUiLanguage('en', 'zh-cn'), 'en');
    assert.strictEqual(resolveUiLanguage('auto', 'zh-cn'), 'zh-cn');
    assert.strictEqual(resolveUiLanguage('auto', 'en-us'), 'en');
    assert.strictEqual(resolveUiLanguage(undefined, 'zh-tw'), 'zh-cn');
  });

  it('provides Chinese text for Chinese VS Code locales', () => {
    const messages = getImportExportMessages('zh-cn');
    assert.strictEqual(messages.importButton, '导入节点数据...');
    assert.strictEqual(messages.openImportFormatButton, '查看导入格式...');
    assert.strictEqual(messages.downloadTemplateButton, '下载标准模板');
    assert.strictEqual(messages.languageButton, '设置语言...');
    assert.match(messages.importSuccess({ created: 2, updated: 1, skipped: 0 }), /已导入/);
    assert.match(messages.exportProgress('/app', true), /正在导出/);
  });

  it('provides English text for English and unsupported VS Code locales', () => {
    assert.strictEqual(getImportExportMessages('en').importButton, 'Import Node Data...');
    assert.strictEqual(getImportExportMessages('en-us').overwriteLabel, 'Overwrite existing nodes');
    assert.strictEqual(getImportExportMessages('fr').skipLabel, 'Skip existing nodes');
    assert.strictEqual(getImportExportMessages('en').openImportFormatButton, 'View Import Format...');
    assert.strictEqual(getImportExportMessages('en').downloadTemplateButton, 'Download Standard Template');
    assert.strictEqual(getImportExportMessages('en').languageButton, 'Set Language...');
  });
});
