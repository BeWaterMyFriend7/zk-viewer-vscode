import * as vscode from 'vscode';
import {
  ConnectionManager,
  type ClientFactory,
  type ConnectionManagerOptions,
} from './connections/connection-manager';
import {
  buildZkConnectionString,
  ConnectionStore,
  type ConnectionConfig,
  type KeyValueStorage,
} from './connections/connection-store';
import { SecretStorageWrapper, type SecretStorageLike } from './connections/secret-storage';
import {
  collectNodeDataExport,
  serializeNodeDataExport,
  type NodeDataExport,
} from './commands/export-node-data';
import {
  importNodeData,
  NodeDataImportError,
  parseNodeDataImport,
  type ImportConflictPolicy,
  type NodeDataImportResult,
} from './commands/import-node-data';
import { createImportTemplateDocument, IMPORT_TEMPLATE_FILE_NAME } from './commands/import-template';
import { deleteNodeRecursively, validateNodeName } from './commands/node-commands';
import {
  getImportExportMessages,
  resolveUiLanguage,
  type ImportExportMessages,
  type UiLanguage,
  type UiLanguagePreference,
} from './i18n/import-export-messages';
import { log } from './log/activity-log';
import { isSearchOptions, searchNodes, type SearchOptions, type SearchOutcome } from './search/node-search';
import { resolvePath } from './search/path-resolver';
import { NodeTreeProvider, revealPathInTree, TreeRevealError, type ZkNode } from './tree/node-tree-provider';
import { ImportTemplatePanel } from './webview/import-template-panel';
import { ConnectionFormPanel } from './webview/connection-form-panel';
import { NodeCreatePanel } from './webview/node-create-panel';
import { NodeDetailPanel } from './webview/node-detail-panel';
import { TREE_SORT_ORDERS, type TreeSortOrder } from './tree/node-tree';
import { MockZkClient } from './zk/mock-zk';
import { NodeZkClient, ZkError, ZkErrorCode, type ZkClient } from './zk/zk-client';

let store: ConnectionStore;
let manager: ConnectionManager;
let statusBar: vscode.StatusBarItem;
let activeConnection: ConnectionConfig | undefined;
let treeProvider: NodeTreeProvider;
let treeView: vscode.TreeView<ZkNode>;
let lastRevealedPath: string | undefined;
let lastCommandError: string | undefined;
let extensionContext: vscode.ExtensionContext;
let appliedUiLanguage: UiLanguage | undefined;
let uiLanguageUpdateQueue: Promise<void> = Promise.resolve();

const mockClients = new Map<string, MockZkClient>();

function isMockMode(): boolean {
  return (
    process.env.ZK_VIEWER_USE_MOCK === '1' ||
    vscode.workspace.getConfiguration('zkViewer').get<boolean>('dev.useMockClient') === true
  );
}

function createClientFactory(useMock: boolean): ClientFactory {
  if (!useMock) {
    return (config, options) =>
      new NodeZkClient(buildZkConnectionString(config), {
        sessionTimeoutMs: options.sessionTimeoutMs,
        username: config.username,
        password: options.password,
      });
  }
  return (config) => {
    const key = `${config.hosts}|${config.chroot ?? ''}`;
    let client = mockClients.get(key);
    if (!client) {
      client = new MockZkClient({
        username: config.username,
        password: config.username ? 'mock' : undefined,
      });
      mockClients.set(key, client);
    }
    return client;
  };
}

/**
 * Attempts a real connection using the given config and password, then closes
 * the client. Throws when the connect fails or times out so the form can
 * surface the reason to the user.
 */
async function testConnection(config: ConnectionConfig, password?: string): Promise<void> {
  const client = createClientFactory(isMockMode())(config, {
    sessionTimeoutMs: config.sessionTimeoutMs ?? 10000,
    password,
  });
  try {
    await client.connect();
  } finally {
    client.close();
  }
}

function registerCommand(
  context: vscode.ExtensionContext,
  command: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => unknown,
) {
  context.subscriptions.push(vscode.commands.registerCommand(command, handler));
}

function registerLocalizedCommand(
  context: vscode.ExtensionContext,
  command: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => unknown,
): void {
  registerCommand(context, command, handler);
  registerCommand(context, `${command}.zh`, handler);
  registerCommand(context, `${command}.en`, handler);
}

function getUiLanguagePreference(): UiLanguagePreference {
  const preference = vscode.workspace.getConfiguration('zkViewer').get<UiLanguagePreference>('uiLanguage');
  return preference === 'zh-cn' || preference === 'en' ? preference : 'auto';
}

function getUiLanguage(): UiLanguage {
  return resolveUiLanguage(getUiLanguagePreference(), vscode.env.language);
}

function getUiMessages(): ImportExportMessages {
  return getImportExportMessages(getUiLanguage());
}

function updateUiLanguageContext(): Promise<UiLanguage> {
  const update = uiLanguageUpdateQueue.then(async () => {
    const language = getUiLanguage();
    if (language !== appliedUiLanguage) {
      await vscode.commands.executeCommand('setContext', 'zkViewer:uiLanguage', language);
      appliedUiLanguage = language;
      const messages = getImportExportMessages(language);
      ImportTemplatePanel.refresh(messages, language);
      NodeDetailPanel.refresh(messages);
      if (statusBar && manager) {
        updateUiState(manager.getState());
      }
    }
    return language;
  });
  uiLanguageUpdateQueue = update.then(
    () => undefined,
    () => undefined,
  );
  return update;
}

function updateUiState(state: string): void {
  const messages = getUiMessages().connection;
  if (state === 'connected') {
    statusBar.text = messages.statusConnected(activeConnection?.name);
    statusBar.tooltip = activeConnection
      ? `${activeConnection.hosts}${activeConnection.chroot ?? ''}`
      : undefined;
    statusBar.show();
  } else if (state === 'connecting') {
    statusBar.text = messages.statusConnecting;
    statusBar.show();
  } else {
    statusBar.text = messages.statusDisconnected;
    statusBar.show();
  }
  void vscode.commands.executeCommand('setContext', 'zkViewer.connected', state === 'connected');
  treeProvider?.refresh();
}

async function pickConnection(placeholder: string): Promise<ConnectionConfig | undefined> {
  const messages = getUiMessages().connection;
  const configs = await store.list();
  if (configs.length === 0) {
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    configs.map((config) => ({
      label: config.name,
      detail: `${config.hosts}${config.chroot ?? ''}`,
      description: config.username ? messages.userDescription(config.username) : messages.noAuthDescription,
      config,
    })),
    { placeHolder: placeholder },
  );
  return picked?.config;
}

async function connectCommand(): Promise<void> {
  const messages = getUiMessages().connection;
  if (manager.getState() === 'connected') {
    void vscode.window.showInformationMessage(messages.alreadyConnected);
    return;
  }
  let selected = await pickConnection(messages.selectConnection);
  if (!selected) {
    if (process.env.ZK_VIEWER_USE_MOCK === '1') {
      selected = { id: 'mock-default', name: 'Mock ZooKeeper', hosts: 'localhost:2181' };
      await store.save(selected);
    } else {
      void vscode.window.showInformationMessage(messages.noConnections);
      return;
    }
  }
  activeConnection = selected;
  const password = await store.getPassword(selected.id);
  try {
    log(`Connecting to ${selected.hosts}${selected.chroot ?? ''}...`);
    await manager.connect(selected, password);
    log(`Connected to ${selected.name}`);
    void vscode.window.showInformationMessage(messages.connected(selected.name));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Connection failed: ${message}`, 'error');
    void vscode.window.showErrorMessage(messages.connectionFailed(message));
  }
}

async function disconnectCommand(): Promise<void> {
  if (manager.getState() === 'closed') {
    return;
  }
  manager.disconnect();
  activeConnection = undefined;
  log('Disconnected');
  void vscode.window.showInformationMessage(getUiMessages().connection.disconnected);
}

async function addConnectionCommand(): Promise<void> {
  const messages = getUiMessages();
  ConnectionFormPanel.open({
    context: extensionContext,
    messages,
    language: getUiLanguage(),
    testConnection,
    onSave: async ({ config, password }) => {
      await store.save(config, password);
      log(`Saved connection "${config.name}" (${config.hosts}${config.chroot ?? ''})`);
      void vscode.window.showInformationMessage(messages.connection.connectionSaved(config.name));
    },
  });
}

async function editConnectionCommand(): Promise<void> {
  const messages = getUiMessages();
  const config = await pickConnection(messages.connection.editConnectionPrompt);
  if (!config) {
    void vscode.window.showInformationMessage(messages.connection.noConnectionsToEdit);
    return;
  }
  ConnectionFormPanel.open({
    context: extensionContext,
    messages,
    language: getUiLanguage(),
    initial: config,
    testConnection,
    onSave: async ({ config: updated, password }) => {
      // Passing an undefined password keeps any existing stored secret; a
      // changed value overwrites it.
      await store.save(updated, password);
      log(`Updated connection "${updated.name}"`);
    },
  });
}

async function removeConnectionCommand(): Promise<void> {
  const messages = getUiMessages().connection;
  const config = await pickConnection(messages.removeConnectionPrompt);
  if (!config) {
    return;
  }
  const confirmed = await vscode.window.showWarningMessage(
    messages.removeConnectionConfirm(config.name),
    { modal: true },
    messages.removeButton,
  );
  if (confirmed !== messages.removeButton) {
    return;
  }
  await store.remove(config.id);
  if (activeConnection?.id === config.id) {
    manager.disconnect();
    activeConnection = undefined;
  }
  log(`Removed connection "${config.name}"`);
}

async function gotoPathCommand(targetPath?: string): Promise<void> {
  const messages = getUiMessages();
  const client = manager.getClient();
  if (!client) {
    void vscode.window.showInformationMessage(messages.notConnected);
    return;
  }
  const input =
    targetPath ??
    (await vscode.window.showInputBox({
      title: messages.node.pathTitle,
      value: '/',
      prompt: messages.node.pathPrompt,
    }));
  if (!input) {
    return;
  }
  try {
    const resolved = await resolvePath(client, input);
    lastRevealedPath = resolved;
    await revealPathInTree(treeView, treeProvider, resolved);
    log(`Revealed ${resolved}`);
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const message =
      err instanceof ZkError && err.code === ZkErrorCode.NO_NODE
        ? messages.node.notFound(input)
        : err instanceof TreeRevealError
          ? err.code === 'sidebar-not-open'
            ? messages.node.sidebarNotOpen
            : messages.node.notFound(input)
          : rawMessage.includes('must start with "/"')
            ? messages.node.invalidPath(input)
            : rawMessage;
    lastCommandError = message;
    log(`Goto path failed: ${message}`, 'error');
    void vscode.window.showErrorMessage(message);
  }
}

async function promptSearchOptions(initialSubtree?: string): Promise<SearchOptions | undefined> {
  const messages = getUiMessages().search;
  const modes: SearchOptions['mode'][] = ['prefix', 'exact', 'contains', 'wildcard', 'regex', 'content'];
  const modePick = await vscode.window.showQuickPick(
    modes.map((mode) => ({ label: messages.modeLabels[mode], mode })),
    { placeHolder: messages.modePrompt },
  );
  if (!modePick) {
    return undefined;
  }
  const query = await vscode.window.showInputBox({
    title: messages.queryTitle(modePick.label),
    ignoreFocusOut: true,
  });
  if (query === undefined || query.trim() === '') {
    return undefined;
  }
  let subtree = initialSubtree;
  if (!subtree && modePick.mode === 'content') {
    const input = await vscode.window.showInputBox({
      title: messages.subtreeRootTitle,
      value: '/',
    });
    if (input === undefined) {
      return undefined;
    }
    subtree = input.trim() || undefined;
  }
  return { mode: modePick.mode, query: query.trim(), subtree };
}

async function runSearch(
  client: ZkClient,
  opts: SearchOptions,
  interactive: boolean,
): Promise<SearchOutcome> {
  const maxNodes = vscode.workspace.getConfiguration('zkViewer').get<number>('maxSearchNodes') ?? 500000;
  const maxDataBytes = vscode.workspace.getConfiguration('zkViewer').get<number>('maxNodeDataBytes') ?? 0;
  const messages = getUiMessages().search;
  const doSearch = (token?: vscode.CancellationToken) =>
    searchNodes(client, {
      ...opts,
      maxNodes,
      maxDataBytes,
      isCancelled: token ? () => token.isCancellationRequested : undefined,
    });
  let outcome: SearchOutcome;
  if (interactive) {
    outcome = (await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: messages.progress(opts.query, opts.subtree),
        cancellable: true,
      },
      (_progress, token) => doSearch(token),
    )) as SearchOutcome;
  } else {
    outcome = await doSearch();
  }
  const { results } = outcome;
  log(
    `Search "${opts.query}" (${opts.mode}): ${results.length} results (visited ${outcome.visitedNodes})` +
      (outcome.oversizedSkipped > 0 ? `, skipped ${outcome.oversizedSkipped} oversized` : ''),
  );
  if (interactive) {
    if (outcome.cancelled) {
      void vscode.window.showInformationMessage(messages.cancelled);
      return outcome;
    }
    if (outcome.truncated) {
      void vscode.window.showWarningMessage(messages.truncated(outcome.maxNodes));
    }
    if (outcome.oversizedSkipped > 0) {
      void vscode.window.showWarningMessage(messages.oversizedSkipped(outcome.oversizedSkipped));
    }
    if (results.length === 0) {
      void vscode.window.showInformationMessage(messages.noMatches);
      return outcome;
    }
    const picked = await vscode.window.showQuickPick(
      results.map((result) => ({
        label: result.path,
        description: messages.matchedBy[result.matchedBy],
      })),
      { placeHolder: messages.results(results.length), matchOnDescription: true },
    );
    if (picked) {
      try {
        await revealPathInTree(treeView, treeProvider, picked.label);
      } catch (revealErr) {
        const rawMessage = revealErr instanceof Error ? revealErr.message : String(revealErr);
        const nodeMessages = getUiMessages().node;
        const userMessage =
          revealErr instanceof TreeRevealError
            ? revealErr.code === 'sidebar-not-open'
              ? nodeMessages.sidebarNotOpen
              : nodeMessages.notFound(picked.label)
            : rawMessage;
        log(`Reveal failed: ${rawMessage}`, 'error');
        void vscode.window.showErrorMessage(userMessage);
      }
    }
  }
  return outcome;
}

async function searchCommand(arg?: unknown): Promise<unknown> {
  const client = manager.getClient();
  if (!client) {
    void vscode.window.showInformationMessage(getUiMessages().notConnected);
    return;
  }
  // view/title buttons pass the TreeView as the first argument; only treat
  // arguments that actually look like SearchOptions as explicit options.
  const explicitOptions = isSearchOptions(arg) ? arg : undefined;
  const opts = explicitOptions ?? (await promptSearchOptions());
  if (!opts) {
    return;
  }
  return runSearch(client, opts, !explicitOptions);
}

async function searchSubtreeCommand(node?: ZkNode, options?: SearchOptions): Promise<unknown> {
  const client = manager.getClient();
  if (!client) {
    void vscode.window.showInformationMessage(getUiMessages().notConnected);
    return;
  }
  const subtree = (node as ZkNode | undefined)?.descriptor?.path ?? treeView.selection[0]?.descriptor.path;
  if (!subtree) {
    return;
  }
  const explicitOptions = isSearchOptions(options) ? options : undefined;
  const opts = explicitOptions
    ? { ...explicitOptions, subtree: explicitOptions.subtree ?? subtree }
    : await promptSearchOptions(subtree);
  if (!opts) {
    return;
  }
  log(`Subtree search under ${subtree}: "${opts.query}" (${opts.mode})`);
  return runSearch(client, opts, !explicitOptions);
}

async function openNodeDetailCommand(node?: ZkNode, newTab = false): Promise<void> {
  const messages = getUiMessages();
  const client = manager.getClient();
  if (!client) {
    void vscode.window.showInformationMessage(messages.notConnected);
    return;
  }
  let path: string | undefined = (node as ZkNode | undefined)?.descriptor?.path;
  if (!path) {
    const selected = treeView.selection[0] as ZkNode | undefined;
    path = selected?.descriptor.path;
  }
  if (!path) {
    path = await vscode.window.showInputBox({ title: messages.node.pathTitle, value: '/' });
  }
  if (!path) {
    return;
  }
  try {
    const resolved = await resolvePath(client, path);
    await NodeDetailPanel.open(
      extensionContext,
      client,
      resolved,
      getUiMessages(),
      {
        onNodeDeleted: () => treeProvider.refresh(),
      },
      newTab,
    );
    log(`Opened detail panel for ${resolved}`);
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const message =
      err instanceof ZkError && err.code === ZkErrorCode.NO_NODE ? messages.node.notFound(path) : rawMessage;
    log(`Open detail failed: ${rawMessage}`, 'error');
    void vscode.window.showErrorMessage(message);
  }
}

function closeAllNodeDetailsCommand(): void {
  NodeDetailPanel.closeAll();
  log('Closed all node detail panels');
}

async function addNodeCommand(
  node?: ZkNode,
  options?: { name?: string; mode?: string; data?: string },
): Promise<void> {
  const messages = getUiMessages();
  const client = manager.getClient();
  if (!client) {
    void vscode.window.showInformationMessage(messages.notConnected);
    return;
  }
  const parentPath = node?.descriptor.path ?? treeView.selection[0]?.descriptor.path ?? '/';
  // Programmatic entry (tests, command options) keeps the direct-create path so
  // callers that supply a name still create the node immediately. Interactive
  // use (no options) opens the modal form instead.
  if (options?.name) {
    const invalid = validateNodeName(options.name, messages.node.invalidName);
    if (invalid) {
      void vscode.window.showErrorMessage(invalid);
      log(`Add node rejected: ${invalid}`, 'error');
      return;
    }
    const fullPath = parentPath === '/' ? `/${options.name}` : `${parentPath}/${options.name}`;
    try {
      const created = await client.create(
        fullPath,
        Buffer.from(options.data ?? '', 'utf8'),
        (options.mode ?? 'PERSISTENT') as Parameters<typeof client.create>[2],
      );
      treeProvider.refresh();
      log(`Created ${created}`);
      void vscode.window.showInformationMessage(messages.node.created(created));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`Add node failed: ${message}`, 'error');
      void vscode.window.showErrorMessage(message);
    }
    return;
  }
  NodeCreatePanel.open({
    context: extensionContext,
    client,
    parentPath,
    messages,
    language: getUiLanguage(),
    initial: options,
    onCreated: (createdPath) => {
      treeProvider.refresh();
      log(`Created ${createdPath}`);
      void vscode.window.showInformationMessage(messages.node.created(createdPath));
    },
  });
}
async function deleteNodeCommand(
  node?: ZkNode,
  options?: { recursive?: boolean; confirm?: boolean | 'cancel' },
): Promise<void> {
  const messages = getUiMessages();
  const client = manager.getClient();
  if (!client) {
    void vscode.window.showInformationMessage(messages.notConnected);
    return;
  }
  const path = node?.descriptor.path ?? treeView.selection[0]?.descriptor.path;
  if (!path) {
    return;
  }
  lastCommandError = undefined;
  if (path === '/') {
    void vscode.window.showWarningMessage(messages.node.rootCannotDelete);
    return;
  }
  let recursive = options?.recursive ?? false;
  if (options?.confirm === 'cancel') {
    log('Delete cancelled');
    return;
  }
  if (options?.confirm !== false) {
    const choice = await vscode.window.showWarningMessage(
      messages.node.deleteConfirm(path),
      { modal: true },
      messages.node.deleteButton,
      messages.node.deleteRecursiveButton,
    );
    if (choice === undefined) {
      log('Delete cancelled');
      return;
    }
    recursive = choice === messages.node.deleteRecursiveButton;
  }
  try {
    if (recursive) {
      await deleteNodeRecursively(client, path);
    } else {
      await client.remove(path);
    }
    log(`Deleted ${path}`);
    treeProvider.refresh();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = err instanceof ZkError ? err.code : undefined;
    const guidance =
      code === ZkErrorCode.NOT_EMPTY
        ? messages.node.deleteNotEmpty
        : code === ZkErrorCode.NO_AUTH
          ? messages.node.deleteNoAuth
          : code === ZkErrorCode.NO_NODE
            ? messages.node.deleteNoNode
            : message;
    if (code === ZkErrorCode.NO_NODE) {
      treeProvider.refresh();
    }
    const userMessage = messages.node.deleteFailure(path, code, guidance);
    lastCommandError = userMessage;
    void vscode.window.showErrorMessage(userMessage);
    log(`Delete failed for ${path}${code ? ` [${code}]` : ''}: ${message}`, 'error');
  }
}

async function copyPathCommand(node?: ZkNode): Promise<void> {
  const path = node?.descriptor.path ?? treeView.selection[0]?.descriptor.path;
  if (!path) {
    return;
  }
  await vscode.env.clipboard.writeText(path);
  log(`Copied path ${path}`);
  void vscode.window.showInformationMessage(getUiMessages().node.copied(path));
}

function exportFileName(path: string, recursive: boolean): string {
  const pathName = path === '/' ? 'root' : path.slice(1).replace(/[^a-zA-Z0-9._-]+/g, '_');
  return `${pathName || 'node'}${recursive ? '-subtree' : ''}.json`;
}

async function exportNodeDataCommand(
  node: ZkNode | undefined,
  recursive: boolean,
  options?: { targetUri?: vscode.Uri },
): Promise<NodeDataExport | undefined> {
  const messages = getUiMessages();
  const client = manager.getClient();
  if (!client) {
    void vscode.window.showInformationMessage(messages.notConnected);
    return;
  }
  const path = node?.descriptor.path ?? treeView.selection[0]?.descriptor.path;
  if (!path) {
    return;
  }
  const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
  const fileName = exportFileName(path, recursive);
  const defaultUri = workspaceUri ? vscode.Uri.joinPath(workspaceUri, fileName) : undefined;
  const target =
    options?.targetUri ??
    (await vscode.window.showSaveDialog({
      title: messages.exportDialogTitle(path, recursive),
      defaultUri,
      filters: { JSON: ['json'] },
      saveLabel: messages.exportSaveLabel,
    }));
  if (!target) {
    return;
  }
  try {
    const exported = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: messages.exportProgress(path, recursive),
      },
      () => collectNodeDataExport(client, path, recursive),
    );
    await vscode.workspace.fs.writeFile(target, Buffer.from(serializeNodeDataExport(exported), 'utf8'));
    log(`Exported ${exported.nodes.length} node(s) from ${path} to ${target.fsPath}`);
    void vscode.window.showInformationMessage(messages.exportSuccess(exported.nodes.length, target.fsPath));
    return exported;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Export failed: ${message}`, 'error');
    void vscode.window.showErrorMessage(messages.exportFailure(message));
    return undefined;
  }
}

interface ImportCommandOptions {
  sourceUri?: vscode.Uri;
  conflictPolicy?: ImportConflictPolicy;
}

function isImportCommandOptions(value: unknown): value is ImportCommandOptions {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const options = value as ImportCommandOptions;
  return (
    options.sourceUri instanceof vscode.Uri ||
    options.conflictPolicy === 'overwrite' ||
    options.conflictPolicy === 'skip'
  );
}

async function importNodeDataCommand(
  firstArg?: unknown,
  secondArg?: ImportCommandOptions,
): Promise<NodeDataImportResult | undefined> {
  const messages = getUiMessages();
  const client = manager.getClient();
  if (!client) {
    void vscode.window.showInformationMessage(messages.notConnected);
    return;
  }
  const options = isImportCommandOptions(firstArg) ? firstArg : secondArg;
  const source =
    options?.sourceUri ??
    (
      await vscode.window.showOpenDialog({
        title: messages.importDialogTitle,
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { JSON: ['json'] },
        openLabel: messages.importOpenLabel,
      })
    )?.[0];
  if (!source) {
    return;
  }

  try {
    const content = Buffer.from(await vscode.workspace.fs.readFile(source)).toString('utf8');
    const document = parseNodeDataImport(content);
    let conflictPolicy = options?.conflictPolicy;
    if (!conflictPolicy) {
      conflictPolicy = (
        await vscode.window.showQuickPick(
          [
            {
              label: messages.skipLabel,
              description: messages.skipDescription,
              policy: 'skip' as const,
            },
            {
              label: messages.overwriteLabel,
              description: messages.overwriteDescription,
              policy: 'overwrite' as const,
            },
          ],
          { placeHolder: messages.conflictPrompt },
        )
      )?.policy;
    }
    if (!conflictPolicy) {
      return;
    }
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: messages.importProgress,
      },
      () => importNodeData(client, document, conflictPolicy),
    );
    treeProvider.refresh();
    log(
      `Imported node data from ${source.fsPath}: ${result.created} created, ` +
        `${result.updated} updated, ${result.skipped} skipped`,
    );
    void vscode.window.showInformationMessage(messages.importSuccess(result));
    return result;
  } catch (err) {
    const detail =
      err instanceof NodeDataImportError
        ? messages.importValidationFailure(err.code, err.path, err.detail)
        : err instanceof Error
          ? err.message
          : String(err);
    log(`Import failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    void vscode.window.showErrorMessage(messages.importFailure(detail));
    return undefined;
  }
}

async function setTreeSortCommand(): Promise<void> {
  const messages = getUiMessages().sort;
  const current = vscode.workspace.getConfiguration('zkViewer').get<TreeSortOrder>('treeSort') ?? 'name';
  const picked = await vscode.window.showQuickPick(
    TREE_SORT_ORDERS.map((option) => ({
      label: messages.labels[option.value],
      description: option.value === current ? messages.current : undefined,
      value: option.value,
    })),
    { placeHolder: messages.prompt },
  );
  if (!picked) {
    return;
  }
  await vscode.workspace
    .getConfiguration('zkViewer')
    .update('treeSort', picked.value, vscode.ConfigurationTarget.Global);
  treeProvider.refresh();
  log(`Tree sort set to ${picked.value}`);
  void vscode.window.showInformationMessage(messages.changed(picked.label));
}

interface SetLanguageCommandOptions {
  preference?: UiLanguagePreference;
  silent?: boolean;
}

function isSetLanguageCommandOptions(value: unknown): value is SetLanguageCommandOptions {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const preference = (value as SetLanguageCommandOptions).preference;
  return preference === undefined || preference === 'auto' || preference === 'zh-cn' || preference === 'en';
}

async function setLanguageCommand(options?: unknown): Promise<UiLanguage | undefined> {
  const messages = getUiMessages();
  const current = getUiLanguagePreference();
  let preference = isSetLanguageCommandOptions(options) ? options.preference : undefined;

  if (!preference) {
    const picked = await vscode.window.showQuickPick(
      [
        {
          label: messages.followVsCodeLabel,
          description: current === 'auto' ? messages.currentDescription : messages.followVsCodeDescription,
          preference: 'auto' as const,
        },
        {
          label: messages.chineseLabel,
          description: current === 'zh-cn' ? messages.currentDescription : undefined,
          preference: 'zh-cn' as const,
        },
        {
          label: messages.englishLabel,
          description: current === 'en' ? messages.currentDescription : undefined,
          preference: 'en' as const,
        },
      ],
      { placeHolder: messages.languagePrompt },
    );
    if (!picked) {
      return undefined;
    }
    preference = picked.preference;
  }

  await vscode.workspace
    .getConfiguration('zkViewer')
    .update('uiLanguage', preference, vscode.ConfigurationTarget.Global);
  const language = await updateUiLanguageContext();
  if (!(isSetLanguageCommandOptions(options) && options.silent)) {
    void vscode.window.showInformationMessage(getUiMessages().languageChanged);
  }
  return language;
}

interface DownloadImportTemplateOptions {
  targetUri?: vscode.Uri;
  silent?: boolean;
}

async function downloadImportTemplateCommand(
  options?: DownloadImportTemplateOptions,
): Promise<vscode.Uri | undefined> {
  const messages = getUiMessages();
  const defaultBaseUri = vscode.workspace.workspaceFolders?.[0]?.uri ?? extensionContext.globalStorageUri;
  const targetUri =
    options?.targetUri ??
    (await vscode.window.showSaveDialog({
      title: messages.downloadDialogTitle,
      saveLabel: messages.downloadSaveLabel,
      defaultUri: vscode.Uri.joinPath(defaultBaseUri, IMPORT_TEMPLATE_FILE_NAME),
      filters: { JSON: ['json'] },
    }));
  if (!targetUri) {
    return undefined;
  }

  try {
    const content = serializeNodeDataExport(createImportTemplateDocument());
    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(content, 'utf8'));
    if (!options?.silent) {
      void vscode.window.showInformationMessage(messages.downloadSuccess(targetUri.fsPath));
    }
    return targetUri;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    lastCommandError = detail;
    if (!options?.silent) {
      void vscode.window.showErrorMessage(messages.downloadFailure(detail));
    }
    return undefined;
  }
}

function openImportFormatCommand(): void {
  ImportTemplatePanel.open(extensionContext, getUiMessages(), getUiLanguage(), () =>
    downloadImportTemplateCommand(),
  );
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  log('zk-viewer-vscode activating');
  extensionContext = context;

  store = new ConnectionStore(
    context.workspaceState as unknown as KeyValueStorage,
    new SecretStorageWrapper(context.secrets as unknown as SecretStorageLike),
  );

  const config = vscode.workspace.getConfiguration('zkViewer');
  const managerOptions: ConnectionManagerOptions = {
    maxReconnectAttempts: config.get<number>('maxReconnectAttempts') ?? 3,
    reconnectDelayMs: config.get<number>('reconnectDelayMs') ?? 2000,
  };
  manager = new ConnectionManager(createClientFactory(isMockMode()), managerOptions);
  manager.onStateChange((state) => updateUiState(state));

  treeProvider = new NodeTreeProvider(() => manager.getClient(), context.extensionUri);
  treeView = vscode.window.createTreeView('zkViewer.tree', { treeDataProvider: treeProvider });
  context.subscriptions.push(treeView);

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  context.subscriptions.push(statusBar);
  updateUiState(manager.getState());
  await updateUiLanguageContext();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('zkViewer.uiLanguage')) {
        void updateUiLanguageContext();
      }
    }),
  );

  if (process.env.ZK_VIEWER_USE_MOCK === '1') {
    (globalThis as { __zkViewerTestApi?: unknown }).__zkViewerTestApi = getTestApi();
  }

  registerLocalizedCommand(context, 'zkViewer.connect', connectCommand);
  registerLocalizedCommand(context, 'zkViewer.disconnect', disconnectCommand);
  registerLocalizedCommand(context, 'zkViewer.addConnection', addConnectionCommand);
  registerLocalizedCommand(context, 'zkViewer.editConnection', editConnectionCommand);
  registerLocalizedCommand(context, 'zkViewer.removeConnection', removeConnectionCommand);

  registerLocalizedCommand(context, 'zkViewer.refresh', () => treeProvider.refresh());
  registerLocalizedCommand(context, 'zkViewer.search', searchCommand);
  registerLocalizedCommand(context, 'zkViewer.gotoPath', gotoPathCommand);
  registerLocalizedCommand(context, 'zkViewer.addNode', addNodeCommand);
  registerLocalizedCommand(context, 'zkViewer.editNode', openNodeDetailCommand);
  registerLocalizedCommand(context, 'zkViewer.deleteNode', deleteNodeCommand);
  registerLocalizedCommand(context, 'zkViewer.copyPath', copyPathCommand);
  registerLocalizedCommand(
    context,
    'zkViewer.exportNodeData',
    (node?: ZkNode, options?: { targetUri?: vscode.Uri }) => exportNodeDataCommand(node, false, options),
  );
  registerLocalizedCommand(
    context,
    'zkViewer.exportSubtreeData',
    (node?: ZkNode, options?: { targetUri?: vscode.Uri }) => exportNodeDataCommand(node, true, options),
  );
  registerLocalizedCommand(context, 'zkViewer.importNodeData', importNodeDataCommand);
  registerLocalizedCommand(context, 'zkViewer.openImportFormat', openImportFormatCommand);
  registerLocalizedCommand(context, 'zkViewer.setLanguage', setLanguageCommand);
  registerCommand(context, 'zkViewer.downloadImportTemplate', downloadImportTemplateCommand);
  registerLocalizedCommand(context, 'zkViewer.openNodeDetail', openNodeDetailCommand);
  registerLocalizedCommand(context, 'zkViewer.openNodeDetailInNewTab', (node?: ZkNode) =>
    openNodeDetailCommand(node, true),
  );
  registerLocalizedCommand(context, 'zkViewer.closeAllNodeDetails', closeAllNodeDetailsCommand);
  registerLocalizedCommand(context, 'zkViewer.setTreeSort', setTreeSortCommand);
  registerLocalizedCommand(context, 'zkViewer.searchSubtree', searchSubtreeCommand);

  log('zk-viewer-vscode activated');
}

export function deactivate(): void {
  if (manager) {
    manager.disconnect();
  }
  log('zk-viewer-vscode deactivated');
}

/**
 * Test-only accessor used by integration tests running in the extension host.
 */
export function getTestApi(): {
  manager: ConnectionManager;
  store: ConnectionStore;
  mockClients: Map<string, MockZkClient>;
  treeProvider: NodeTreeProvider;
  treeView: vscode.TreeView<ZkNode>;
  detailController: () => ReturnType<typeof NodeDetailPanel.getController>;
  getAllDetailControllers: () => ReturnType<typeof NodeDetailPanel.getAllControllers>;
  detailPanelHtml: () => string | undefined;
  connectionFormHtml: () => string | undefined;
  nodeCreateHtml: () => string | undefined;
  statusBarText: () => string;
  lastRevealedPath: () => string | undefined;
  lastCommandError: () => string | undefined;
  getActiveConnection: () => ConnectionConfig | undefined;
} {
  return {
    manager,
    store,
    mockClients,
    treeProvider,
    treeView,
    detailController: () => NodeDetailPanel.getController(),
    getAllDetailControllers: () => NodeDetailPanel.getAllControllers(),
    detailPanelHtml: () => NodeDetailPanel.getCurrentHtml(),
    connectionFormHtml: () => ConnectionFormPanel.getCurrentHtml(),
    nodeCreateHtml: () => NodeCreatePanel.getCurrentHtml(),
    statusBarText: () => statusBar.text,
    lastRevealedPath: () => lastRevealedPath,
    lastCommandError: () => lastCommandError,
    getActiveConnection: () => activeConnection,
  };
}
