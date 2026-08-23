import type { NodeDataImportResult } from '../commands/import-node-data';

export interface ImportExportMessages {
  importButton: string;
  exportNodeButton: string;
  exportSubtreeButton: string;
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
}

const english: ImportExportMessages = {
  importButton: 'Import Node Data...',
  exportNodeButton: 'Export Node Data...',
  exportSubtreeButton: 'Export Node and Descendant Data...',
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
};

const chinese: ImportExportMessages = {
  importButton: '导入节点数据...',
  exportNodeButton: '导出节点数据...',
  exportSubtreeButton: '导出节点及所有后代数据...',
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
};

export function getImportExportMessages(language: string): ImportExportMessages {
  return language.toLowerCase().startsWith('zh') ? chinese : english;
}
