import type { NodeDataImportResult } from '../commands/import-node-data';

export type UiLanguage = 'zh-cn' | 'en';
export type UiLanguagePreference = 'auto' | UiLanguage;

export interface ImportExportMessages {
  importButton: string;
  exportNodeButton: string;
  exportSubtreeButton: string;
  openImportFormatButton: string;
  downloadTemplateButton: string;
  languageButton: string;
  notConnected: string;
  importDialogTitle: string;
  importOpenLabel: string;
  conflictPrompt: string;
  overwriteLabel: string;
  overwriteDescription: string;
  skipLabel: string;
  skipDescription: string;
  importProgress: string;
  importSuccess(result: NodeDataImportResult): string;
  importFailure(detail: string): string;
  exportDialogTitle(path: string, recursive: boolean): string;
  exportSaveLabel: string;
  exportProgress(path: string, recursive: boolean): string;
  exportSuccess(count: number, targetPath: string): string;
  exportFailure(detail: string): string;
  importFormatTitle: string;
  importFormatDescription: string;
  importFormatDataHint: string;
  closeButton: string;
  downloadDialogTitle: string;
  downloadSaveLabel: string;
  downloadSuccess(targetPath: string): string;
  downloadFailure(detail: string): string;
  languagePrompt: string;
  followVsCodeLabel: string;
  followVsCodeDescription: string;
  chineseLabel: string;
  englishLabel: string;
  currentDescription: string;
  languageChanged: string;
}

const english: ImportExportMessages = {
  importButton: 'Import Node Data...',
  exportNodeButton: 'Export Node Data...',
  exportSubtreeButton: 'Export Node and Descendant Data...',
  openImportFormatButton: 'View Import Format...',
  downloadTemplateButton: 'Download Standard Template',
  languageButton: 'Set Language...',
  notConnected: 'Not connected.',
  importDialogTitle: 'Import ZooKeeper node data',
  importOpenLabel: 'Import',
  conflictPrompt: 'How should existing nodes be handled?',
  overwriteLabel: 'Overwrite existing nodes',
  overwriteDescription: 'Replace existing node data using version checks.',
  skipLabel: 'Skip existing nodes',
  skipDescription: 'Keep existing node data and create only missing nodes.',
  importProgress: 'Importing ZooKeeper node data...',
  importSuccess: ({ created, updated, skipped }) =>
    `Imported node data: ${created} created, ${updated} updated, ${skipped} skipped.`,
  importFailure: (detail) => `Import failed: ${detail}`,
  exportDialogTitle: (path, recursive) =>
    recursive ? `Export ${path} and all descendants` : `Export ${path}`,
  exportSaveLabel: 'Export',
  exportProgress: (path, recursive) => (recursive ? `Exporting subtree ${path}...` : `Exporting ${path}...`),
  exportSuccess: (count, targetPath) => `Exported ${count} node(s) to ${targetPath}`,
  exportFailure: (detail) => `Export failed: ${detail}`,
  importFormatTitle: 'ZooKeeper Import Format',
  importFormatDescription:
    'Imports accept only the zk-viewer-node-data version 1 format shown below. The example is read-only.',
  importFormatDataHint:
    'The data field is always a string. JSON node data must be escaped as a JSON string; binary data uses Base64.',
  closeButton: 'Close',
  downloadDialogTitle: 'Download standard ZooKeeper import template',
  downloadSaveLabel: 'Download',
  downloadSuccess: (targetPath) => `Standard import template downloaded to ${targetPath}`,
  downloadFailure: (detail) => `Template download failed: ${detail}`,
  languagePrompt: 'ZooKeeper Viewer language',
  followVsCodeLabel: 'Follow VS Code',
  followVsCodeDescription: 'Use the current VS Code display language.',
  chineseLabel: '中文',
  englishLabel: 'English',
  currentDescription: 'current',
  languageChanged: 'ZooKeeper Viewer language updated.',
};

const chinese: ImportExportMessages = {
  importButton: '导入节点数据...',
  exportNodeButton: '导出节点数据...',
  exportSubtreeButton: '导出节点及所有后代数据...',
  openImportFormatButton: '查看导入格式...',
  downloadTemplateButton: '下载标准模板',
  languageButton: '设置语言...',
  notConnected: '尚未连接 ZooKeeper。',
  importDialogTitle: '导入 ZooKeeper 节点数据',
  importOpenLabel: '导入',
  conflictPrompt: '遇到已存在节点时如何处理？',
  overwriteLabel: '覆盖已存在节点',
  overwriteDescription: '使用版本校验替换已存在节点的数据。',
  skipLabel: '跳过已存在节点',
  skipDescription: '保留已有数据，仅创建缺失节点。',
  importProgress: '正在导入 ZooKeeper 节点数据...',
  importSuccess: ({ created, updated, skipped }) =>
    `已导入节点数据：新建 ${created} 个，更新 ${updated} 个，跳过 ${skipped} 个。`,
  importFailure: (detail) => `导入失败：${detail}`,
  exportDialogTitle: (path, recursive) => (recursive ? `导出 ${path} 及其所有后代节点` : `导出 ${path}`),
  exportSaveLabel: '导出',
  exportProgress: (path, recursive) => (recursive ? `正在导出子树 ${path}...` : `正在导出 ${path}...`),
  exportSuccess: (count, targetPath) => `已导出 ${count} 个节点到 ${targetPath}`,
  exportFailure: (detail) => `导出失败：${detail}`,
  importFormatTitle: 'ZooKeeper 导入格式',
  importFormatDescription: '导入仅接受下方所示的 zk-viewer-node-data 版本 1 格式，示例内容只读。',
  importFormatDataHint:
    'data 字段始终是字符串；节点数据为 JSON 时需要转义为 JSON 字符串，二进制数据使用 Base64。',
  closeButton: '关闭',
  downloadDialogTitle: '下载 ZooKeeper 标准导入模板',
  downloadSaveLabel: '下载',
  downloadSuccess: (targetPath) => `标准导入模板已下载到 ${targetPath}`,
  downloadFailure: (detail) => `模板下载失败：${detail}`,
  languagePrompt: 'ZooKeeper Viewer 界面语言',
  followVsCodeLabel: '跟随 VS Code',
  followVsCodeDescription: '使用当前 VS Code 显示语言。',
  chineseLabel: '中文',
  englishLabel: 'English',
  currentDescription: '当前',
  languageChanged: 'ZooKeeper Viewer 界面语言已更新。',
};

export function resolveUiLanguage(
  preference: UiLanguagePreference | undefined,
  vscodeLanguage: string,
): UiLanguage {
  if (preference === 'zh-cn' || preference === 'en') {
    return preference;
  }
  return vscodeLanguage.toLowerCase().startsWith('zh') ? 'zh-cn' : 'en';
}

export function getImportExportMessages(language: string): ImportExportMessages {
  return language.toLowerCase().startsWith('zh') ? chinese : english;
}
