import type { NodeDataImportErrorCode, NodeDataImportResult } from '../commands/import-node-data';

export type UiLanguage = 'zh-cn' | 'en';
export type UiLanguagePreference = 'auto' | UiLanguage;

export interface ConnectionMessages {
  statusConnected(name?: string): string;
  statusConnecting: string;
  statusDisconnected: string;
  userDescription(username: string): string;
  noAuthDescription: string;
  alreadyConnected: string;
  selectConnection: string;
  noConnections: string;
  connected(name: string): string;
  connectionFailed(detail: string): string;
  disconnected: string;
  connectionNameTitle: string;
  hostsCommaTitle: string;
  hostsTitle: string;
  chrootTitle: string;
  usernameOptionalTitle: string;
  tlsNoLabel: string;
  tlsYesLabel: string;
  tlsPrompt: string;
  passwordOptionalTitle: string;
  connectionSaved(name: string): string;
  editConnectionPrompt: string;
  noConnectionsToEdit: string;
  passwordKeepTitle: string;
  removeConnectionPrompt: string;
  removeConnectionConfirm(name: string): string;
  removeButton: string;
  /** Connection form (add/edit) labels. */
  formTitle: string;
  sessionTimeoutTitle: string;
  saveButton: string;
  cancelButton: string;
  hostsRequired: string;
  /** Connection test (form button). */
  testConnectionButton: string;
  testSuccess: string;
  testFailed(detail: string): string;
}

export interface SearchMessages {
  modeLabels: Record<'prefix' | 'exact' | 'contains' | 'wildcard' | 'regex' | 'content', string>;
  modePrompt: string;
  queryTitle(modeLabel: string): string;
  subtreeRootTitle: string;
  progress(query: string, subtree?: string): string;
  cancelled: string;
  truncated(maxNodes: number): string;
  oversizedSkipped(count: number): string;
  noMatches: string;
  results(count: number): string;
  matchedBy: Record<'name' | 'path' | 'content', string>;
}

export interface NodeMessages {
  pathTitle: string;
  pathPrompt: string;
  invalidPath(input: string): string;
  notFound(path: string): string;
  sidebarNotOpen: string;
  parentPathTitle: string;
  nameTitle(parentPath: string): string;
  typePrompt: string;
  typeLabels: Record<'PERSISTENT' | 'PERSISTENT_SEQUENTIAL' | 'EPHEMERAL' | 'EPHEMERAL_SEQUENTIAL', string>;
  dataOptionalTitle: string;
  created(path: string): string;
  invalidName: Record<'empty' | 'slash' | 'dot', string>;
  rootCannotDelete: string;
  deleteConfirm(path: string): string;
  deleteButton: string;
  deleteRecursiveButton: string;
  deleteNotEmpty: string;
  deleteNoAuth: string;
  deleteNoNode: string;
  deleteFailure(path: string, code: string | undefined, guidance: string): string;
  copied(path: string): string;
  /** Node-create form (modal) labels. */
  addNodeTitle: string;
  cancelNodeButton: string;
  createNodeButton: string;
}

export interface SortMessages {
  prompt: string;
  current: string;
  changed(label: string): string;
  labels: Record<'name' | 'name-desc' | 'ctime' | 'ctime-desc' | 'mtime' | 'mtime-desc' | 'none', string>;
}

export interface DetailMessages {
  htmlLanguage: string;
  documentTitle: string;
  eyebrow: string;
  informationHeading: string;
  dataHeading: string;
  displayLabel: string;
  displayModeAria: string;
  wrapOn: string;
  wrapOff: string;
  minifyJson: string;
  dataPlaceholder: string;
  edit: string;
  save: string;
  readOnlyLabel: string;
  statLabels: Record<string, string>;
  kindReadOnly(kind: string): string;
  editingStatus: string;
  readOnlyStatus: string;
  invalidJson(detail: string): string;
  savedAtVersion(version: number | string | undefined): string;
  error(detail: string): string;
  minifySuccess: string;
  minifyInvalid(detail: string): string;
  deletedMessage(path: string): string;
  deletedNotification(path: string): string;
  saveMessageMissing: string;
  dataNotLoaded: string;
  nodeDoesNotExist(path: string): string;
  saveDeleted: string;
  saveFailed(detail: string): string;
  saveDeletedWithDetail(detail: string): string;
  saveVersionConflict(detail: string): string;
}

export interface ImportExportMessages {
  connection: ConnectionMessages;
  search: SearchMessages;
  node: NodeMessages;
  sort: SortMessages;
  detail: DetailMessages;
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
  importValidationFailure(code: NodeDataImportErrorCode, path?: string, detail?: string): string;
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
  connection: {
    statusConnected: (name) => `$(plug) ZK: ${name ?? 'connected'}`,
    statusConnecting: '$(sync~spin) ZK: connecting...',
    statusDisconnected: '$(circle-slash) ZK: disconnected',
    userDescription: (username) => `user: ${username}`,
    noAuthDescription: 'no authentication',
    alreadyConnected: 'Already connected.',
    selectConnection: 'Select a connection',
    noConnections: 'No connections yet. Add one first.',
    connected: (name) => `Connected to ${name}`,
    connectionFailed: (detail) => `Connection failed: ${detail}`,
    disconnected: 'Disconnected.',
    connectionNameTitle: 'Connection name',
    hostsCommaTitle: 'Hosts (comma separated)',
    hostsTitle: 'Hosts',
    chrootTitle: 'Chroot (optional, e.g. /app)',
    usernameOptionalTitle: 'Username (optional)',
    tlsNoLabel: 'No (plain zk://)',
    tlsYesLabel: 'Yes (TLS, ssl://)',
    tlsPrompt: 'Use TLS?',
    passwordOptionalTitle: 'Password (optional)',
    connectionSaved: (name) => `Connection "${name}" saved.`,
    editConnectionPrompt: 'Edit connection',
    noConnectionsToEdit: 'No connections to edit.',
    passwordKeepTitle: 'Password (leave empty to keep existing)',
    removeConnectionPrompt: 'Remove connection',
    removeConnectionConfirm: (name) => `Remove connection "${name}"?`,
    removeButton: 'Remove',
    formTitle: 'Connection',
    sessionTimeoutTitle: 'Session timeout (ms)',
    saveButton: 'Save',
    cancelButton: 'Cancel',
    hostsRequired: 'Hosts must not be empty',
    testConnectionButton: 'Test Connection',
    testSuccess: 'Connection OK',
    testFailed: (detail) => `Connection failed: ${detail}`,
  },
  search: {
    modeLabels: {
      prefix: 'Name prefix',
      exact: 'Exact path (e.g. /app/config)',
      contains: 'Path contains (e.g. 168)',
      wildcard: 'Path wildcard (e.g. /app/*/config)',
      regex: 'Path regex (e.g. ^/svc-\\d+$)',
      content: 'Content',
    },
    modePrompt: 'Search mode',
    queryTitle: (modeLabel) => `Search query (${modeLabel})`,
    subtreeRootTitle: 'Subtree root (optional, default /)',
    progress: (query, subtree) =>
      `Searching "${query}"${subtree && subtree !== '/' ? ` under ${subtree}` : ''}...`,
    cancelled: 'Search cancelled.',
    truncated: (maxNodes) =>
      `Search reached the ${maxNodes}-node limit, so results may be incomplete. Increase zkViewer.maxSearchNodes or search a smaller subtree.`,
    oversizedSkipped: (count) =>
      `Skipped ${count} oversized node(s) above zkViewer.maxNodeDataBytes. Set it to 0 to search every node.`,
    noMatches: 'No matching nodes.',
    results: (count) => `Search results (${count} found)`,
    matchedBy: { name: 'name', path: 'path', content: 'content' },
  },
  node: {
    pathTitle: 'Node path',
    pathPrompt: 'e.g. /app/config',
    invalidPath: (input) => `Invalid path "${input}": it must start with "/"`,
    notFound: (path) => `Node not found: ${path}`,
    sidebarNotOpen: 'The ZooKeeper sidebar is not open. Open it before locating a node.',
    parentPathTitle: 'Parent path',
    nameTitle: (parentPath) => `Node name under ${parentPath}`,
    typePrompt: 'Node type',
    typeLabels: {
      PERSISTENT: 'Persistent',
      PERSISTENT_SEQUENTIAL: 'Persistent Sequential',
      EPHEMERAL: 'Ephemeral',
      EPHEMERAL_SEQUENTIAL: 'Ephemeral Sequential',
    },
    dataOptionalTitle: 'Node data (optional)',
    created: (path) => `Created ${path}`,
    invalidName: {
      empty: 'Node name must not be empty',
      slash: 'Node name must not contain "/"',
      dot: 'Node name must not be "." or ".."',
    },
    rootCannotDelete: 'The root node cannot be deleted.',
    deleteConfirm: (path) => `Delete ${path}?`,
    deleteButton: 'Delete',
    deleteRecursiveButton: 'Delete Recursively',
    deleteNotEmpty: 'node is not empty. Use "Delete Recursively".',
    deleteNoAuth: 'ZooKeeper denied access. Check authentication and ACL permissions.',
    deleteNoNode: 'node no longer exists. Refresh the tree.',
    deleteFailure: (path, code, guidance) => `Cannot delete ${path}${code ? ` [${code}]` : ''}: ${guidance}`,
    copied: (path) => `Copied ${path}`,
    addNodeTitle: 'New Node',
    cancelNodeButton: 'Cancel',
    createNodeButton: 'Create',
  },
  sort: {
    prompt: 'Sort nodes by',
    current: 'current',
    changed: (label) => `Sorted by: ${label}`,
    labels: {
      name: 'Name (A → Z)',
      'name-desc': 'Name (Z → A)',
      ctime: 'Created (oldest first)',
      'ctime-desc': 'Created (newest first)',
      mtime: 'Modified (oldest first)',
      'mtime-desc': 'Modified (newest first)',
      none: 'Server order',
    },
  },
  detail: {
    htmlLanguage: 'en',
    documentTitle: 'Node detail',
    eyebrow: 'ZooKeeper Node',
    informationHeading: 'Node information',
    dataHeading: 'Node data',
    displayLabel: 'Display',
    displayModeAria: 'Display mode',
    wrapOn: 'Wrap: On',
    wrapOff: 'Wrap: Off',
    minifyJson: 'Minify JSON',
    dataPlaceholder: 'Node data',
    edit: 'Edit',
    save: 'Save',
    readOnlyLabel: 'Read-only',
    statLabels: {
      path: 'path',
      version: 'version',
      cversion: 'cversion',
      aversion: 'aversion',
      dataLength: 'dataLength',
      numChildren: 'numChildren',
      ephemeralOwner: 'ephemeralOwner',
      mtime: 'mtime',
      ctime: 'ctime',
      czxid: 'czxid',
      mzxid: 'mzxid',
    },
    kindReadOnly: (kind) => `${kind} (read-only)`,
    editingStatus: 'Editing — changes apply on Save',
    readOnlyStatus: 'Read-only — click Edit to modify',
    invalidJson: (detail) => `Invalid JSON: ${detail}`,
    savedAtVersion: (version) => `Saved at version ${version ?? 0}`,
    error: (detail) => `Error: ${detail}`,
    minifySuccess: 'JSON whitespace removed; string content was preserved',
    minifyInvalid: (detail) => `Cannot minify invalid JSON: ${detail}`,
    deletedMessage: (path) => `Node has been deleted: ${path}`,
    deletedNotification: (path) => `Node was deleted; closing the detail panel: ${path}`,
    saveMessageMissing: 'Save message is missing path or data',
    dataNotLoaded: 'Node data has not been loaded yet',
    nodeDoesNotExist: (path) => `Node does not exist: ${path}`,
    saveDeleted: 'Save failed: the node was deleted. Refresh and try again.',
    saveFailed: (detail) => `Save failed: ${detail}`,
    saveDeletedWithDetail: (detail) =>
      `Save failed: the node was deleted. Refresh and try again. (${detail})`,
    saveVersionConflict: (detail) =>
      `Save failed: the node version changed. Reload and try again. (${detail})`,
  },
  importButton: 'Import Node Data...',
  exportNodeButton: 'Export Node Data...',
  exportSubtreeButton: 'Export Node and All Child Data...',
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
  importValidationFailure: (code, path, detail) => {
    switch (code) {
      case 'invalid-json':
        return `Invalid JSON: ${detail ?? 'syntax error'}`;
      case 'invalid-document':
        return 'The file is not a valid zk-viewer-node-data version 1 document.';
      case 'empty-document':
        return 'The import document does not contain any nodes.';
      case 'invalid-node':
        return 'The import document contains an invalid node entry.';
      case 'invalid-or-duplicate-path':
        return `The node path is outside the export root, invalid, or duplicated: ${path ?? ''}`.trim();
      case 'invalid-base64':
        return `The node contains invalid Base64 data: ${path ?? ''}`.trim();
      case 'missing-root':
        return `The import document does not contain its root node: ${path ?? ''}`.trim();
      case 'non-recursive-multiple':
        return 'A non-recursive import document can contain only its root node.';
      case 'missing-parent':
        return `The external parent node does not exist: ${path ?? ''}`.trim();
    }
  },
  exportDialogTitle: (path, recursive) =>
    recursive ? `Export ${path} and all child nodes...` : `Export ${path}...`,
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
  connection: {
    statusConnected: (name) => `$(plug) ZK：${name ?? '已连接'}`,
    statusConnecting: '$(sync~spin) ZK：正在连接...',
    statusDisconnected: '$(circle-slash) ZK：未连接',
    userDescription: (username) => `用户：${username}`,
    noAuthDescription: '无认证',
    alreadyConnected: '已经连接 ZooKeeper。',
    selectConnection: '选择连接',
    noConnections: '还没有连接配置，请先新增连接。',
    connected: (name) => `已连接到 ${name}`,
    connectionFailed: (detail) => `连接失败：${detail}`,
    disconnected: '已断开连接。',
    connectionNameTitle: '连接名称',
    hostsCommaTitle: '服务器地址（逗号分隔）',
    hostsTitle: '服务器地址',
    chrootTitle: 'Chroot（可选，例如 /app）',
    usernameOptionalTitle: '用户名（可选）',
    tlsNoLabel: '否（普通 zk://）',
    tlsYesLabel: '是（TLS，ssl://）',
    tlsPrompt: '是否使用 TLS？',
    passwordOptionalTitle: '密码（可选）',
    connectionSaved: (name) => `连接“${name}”已保存。`,
    editConnectionPrompt: '选择要编辑的连接',
    noConnectionsToEdit: '没有可编辑的连接。',
    passwordKeepTitle: '密码（留空表示保留现有密码）',
    removeConnectionPrompt: '选择要删除的连接',
    removeConnectionConfirm: (name) => `确定删除连接“${name}”吗？`,
    removeButton: '删除',
    formTitle: '连接',
    sessionTimeoutTitle: '会话超时（毫秒）',
    saveButton: '保存',
    cancelButton: '取消',
    hostsRequired: '服务器地址不能为空',
    testConnectionButton: '测试连接',
    testSuccess: '连接成功',
    testFailed: (detail) => `连接失败：${detail}`,
  },
  search: {
    modeLabels: {
      prefix: '名称前缀',
      exact: '完整路径（例如 /app/config）',
      contains: '路径包含（例如 168）',
      wildcard: '路径通配符（例如 /app/*/config）',
      regex: '路径正则表达式（例如 ^/svc-\\d+$）',
      content: '节点内容',
    },
    modePrompt: '选择搜索方式',
    queryTitle: (modeLabel) => `搜索内容（${modeLabel}）`,
    subtreeRootTitle: '子树根路径（可选，默认为 /）',
    progress: (query, subtree) =>
      `正在搜索“${query}”${subtree && subtree !== '/' ? `，范围：${subtree}` : ''}...`,
    cancelled: '搜索已取消。',
    truncated: (maxNodes) =>
      `搜索达到节点上限（${maxNodes} 个），结果可能不完整。请提高 zkViewer.maxSearchNodes 或缩小子树范围。`,
    oversizedSkipped: (count) =>
      `已跳过 ${count} 个超过 zkViewer.maxNodeDataBytes 的大节点；设为 0 可搜索全部节点。`,
    noMatches: '没有找到匹配的节点。',
    results: (count) => `搜索结果（找到 ${count} 个）`,
    matchedBy: { name: '名称', path: '路径', content: '内容' },
  },
  node: {
    pathTitle: '节点路径',
    pathPrompt: '例如 /app/config',
    invalidPath: (input) => `路径“${input}”无效：必须以“/”开头`,
    notFound: (path) => `未找到节点：${path}`,
    sidebarNotOpen: 'ZooKeeper 侧边栏未打开，无法定位节点，请先打开侧边栏再试。',
    parentPathTitle: '父节点路径',
    nameTitle: (parentPath) => `在 ${parentPath} 下新增节点`,
    typePrompt: '选择节点类型',
    typeLabels: {
      PERSISTENT: '持久节点',
      PERSISTENT_SEQUENTIAL: '持久顺序节点',
      EPHEMERAL: '临时节点',
      EPHEMERAL_SEQUENTIAL: '临时顺序节点',
    },
    dataOptionalTitle: '节点数据（可选）',
    created: (path) => `已创建节点 ${path}`,
    invalidName: {
      empty: '节点名称不能为空',
      slash: '节点名称不能包含“/”',
      dot: '节点名称不能是“.”或“..”',
    },
    rootCannotDelete: '根节点不能删除。',
    deleteConfirm: (path) => `确定删除节点 ${path} 吗？`,
    deleteButton: '删除',
    deleteRecursiveButton: '递归删除',
    deleteNotEmpty: '节点不为空，请选择“递归删除”。',
    deleteNoAuth: 'ZooKeeper 拒绝访问，请检查认证信息和 ACL 权限。',
    deleteNoNode: '节点已不存在，请刷新节点树。',
    deleteFailure: (path, code, guidance) => `无法删除 ${path}${code ? ` [${code}]` : ''}：${guidance}`,
    copied: (path) => `已复制路径 ${path}`,
    addNodeTitle: '新增节点',
    cancelNodeButton: '取消',
    createNodeButton: '创建',
  },
  sort: {
    prompt: '节点排序方式',
    current: '当前',
    changed: (label) => `已按“${label}”排序`,
    labels: {
      name: '名称（A → Z）',
      'name-desc': '名称（Z → A）',
      ctime: '创建时间（从早到晚）',
      'ctime-desc': '创建时间（从晚到早）',
      mtime: '修改时间（从早到晚）',
      'mtime-desc': '修改时间（从晚到早）',
      none: '服务器原始顺序',
    },
  },
  detail: {
    htmlLanguage: 'zh-CN',
    documentTitle: '节点详情',
    eyebrow: 'ZooKeeper 节点',
    informationHeading: '节点信息',
    dataHeading: '节点数据',
    displayLabel: '显示',
    displayModeAria: '显示模式',
    wrapOn: '换行：开',
    wrapOff: '换行：关',
    minifyJson: '压缩 JSON',
    dataPlaceholder: '节点数据',
    edit: '编辑',
    save: '保存',
    readOnlyLabel: '只读',
    statLabels: {
      path: '路径',
      version: '版本',
      cversion: '子节点版本',
      aversion: 'ACL 版本',
      dataLength: '数据长度',
      numChildren: '子节点数',
      ephemeralOwner: '临时节点所有者',
      mtime: '修改时间',
      ctime: '创建时间',
      czxid: 'czxid',
      mzxid: 'mzxid',
    },
    kindReadOnly: (kind) => `${kind}（只读）`,
    editingStatus: '正在编辑——点击“保存”应用修改',
    readOnlyStatus: '只读——点击“编辑”后可修改',
    invalidJson: (detail) => `JSON 格式无效：${detail}`,
    savedAtVersion: (version) => `已保存，版本：${version ?? 0}`,
    error: (detail) => `错误：${detail}`,
    minifySuccess: '已移除 JSON 多余空白，字符串内容保持不变',
    minifyInvalid: (detail) => `无法压缩无效 JSON：${detail}`,
    deletedMessage: (path) => `节点已被删除：${path}`,
    deletedNotification: (path) => `节点已被删除，详情面板将关闭：${path}`,
    saveMessageMissing: '保存消息缺少节点路径或数据',
    dataNotLoaded: '节点数据尚未加载',
    nodeDoesNotExist: (path) => `节点不存在：${path}`,
    saveDeleted: '保存失败：节点已被删除，请刷新后重试。',
    saveFailed: (detail) => `保存失败：${detail}`,
    saveDeletedWithDetail: (detail) => `保存失败：节点已被删除，请刷新后重试（${detail}）`,
    saveVersionConflict: (detail) => `保存失败：节点版本已变化，请重新加载后重试（${detail}）`,
  },
  importButton: '导入节点数据...',
  exportNodeButton: '导出节点数据...',
  exportSubtreeButton: '导出节点及所有子节点数据...',
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
  importValidationFailure: (code, path, detail) => {
    switch (code) {
      case 'invalid-json':
        return `JSON 格式无效：${detail ?? '语法错误'}`;
      case 'invalid-document':
        return '文件不是有效的 zk-viewer-node-data 版本 1 文档。';
      case 'empty-document':
        return '导入文档中没有节点。';
      case 'invalid-node':
        return '导入文档中包含无效的节点记录。';
      case 'invalid-or-duplicate-path':
        return `节点路径超出导出根路径、格式无效或重复：${path ?? ''}`.trim();
      case 'invalid-base64':
        return `节点包含无效的 Base64 数据：${path ?? ''}`.trim();
      case 'missing-root':
        return `导入文档不包含根节点：${path ?? ''}`.trim();
      case 'non-recursive-multiple':
        return '非递归导入文档只能包含根节点。';
      case 'missing-parent':
        return `外部父节点不存在：${path ?? ''}`.trim();
    }
  },
  exportDialogTitle: (path, recursive) => (recursive ? `导出 ${path} 及其所有子节点...` : `导出 ${path}...`),
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
