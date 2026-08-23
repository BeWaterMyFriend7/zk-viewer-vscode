import type { NodeDataExport } from './export-node-data';

export const IMPORT_TEMPLATE_FILE_NAME = 'zk-viewer-import-template.json';

export function createImportTemplateDocument(): NodeDataExport {
  return {
    format: 'zk-viewer-node-data',
    version: 1,
    rootPath: '/example',
    recursive: true,
    nodes: [
      {
        path: '/example',
        data: '{"name":"root"}',
        encoding: 'utf8',
      },
      {
        path: '/example/child',
        data: 'plain text',
        encoding: 'utf8',
      },
      {
        path: '/example/binary',
        data: 'AAEC',
        encoding: 'base64',
      },
    ],
  };
}
