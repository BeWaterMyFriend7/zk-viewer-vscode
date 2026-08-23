import * as assert from 'assert';
import {
  DetailPanelController,
  type DetailPanelDeps,
  type DetailView,
} from '../../src/webview/detail-controller';
import { MockZkClient } from '../../src/zk/mock-zk';
import { ZkErrorCode } from '../../src/zk/zk-client';

class CapturingView implements DetailView {
  readonly messages: unknown[] = [];

  postMessage(message: unknown): void {
    this.messages.push(message);
  }
}

describe('DetailPanelController', () => {
  let client: MockZkClient;
  let view: CapturingView;
  let controller: DetailPanelController;
  let deps: DetailPanelDeps;
  let notifyErrors: Array<{ message: string; code?: string }>;
  let deletedPaths: string[];
  let watchCount: number;

  beforeEach(async () => {
    client = new MockZkClient();
    await client.connect();
    await client.create('/app', Buffer.alloc(0), 'PERSISTENT');
    await client.create('/app/config', Buffer.from('{"role":"web"}'), 'PERSISTENT');
    view = new CapturingView();
    notifyErrors = [];
    deletedPaths = [];
    watchCount = 0;
    deps = {
      getNodeData: (path) => client.getData(path),
      saveNodeData: (path, data, version) => client.setData(path, data, version),
      nodeExists: (path) => client.exists(path),
      watchNode: async (path, onEvent) => {
        watchCount += 1;
        await client.watchData(path, onEvent);
      },
      notifyError: (message, code) => notifyErrors.push({ message, code }),
      onNodeDeleted: (path) => deletedPaths.push(path),
    };
    controller = new DetailPanelController(deps, view);
  });

  it('loadData keeps raw JSON separate from its formatted display text', async () => {
    const message = await controller.load('/app/config');
    assert.strictEqual(message.type, 'loadData');
    assert.strictEqual(message.path, '/app/config');
    assert.strictEqual(message.kind, 'json');
    assert.strictEqual(message.dataText, '{"role":"web"}');
    assert.strictEqual(message.displayText, '{\n  "role": "web"\n}');
    assert.strictEqual(message.editable, true);
    const stat = message.stat;
    for (const field of [
      'czxid',
      'mzxid',
      'ctime',
      'mtime',
      'version',
      'cversion',
      'aversion',
      'ephemeralOwner',
      'dataLength',
      'numChildren',
    ]) {
      assert.ok(field in stat, `stat should include ${field}`);
    }
    assert.strictEqual(view.messages.length, 1);
  });

  it('saves with the loaded version and reloads the node', async () => {
    const loaded = await controller.load('/app/config');
    await controller.handleMessage({
      type: 'save',
      path: '/app/config',
      text: '{"role":"admin"}',
      version: loaded.stat.version,
    });

    assert.strictEqual((await client.getData('/app/config')).data.toString('utf8'), '{"role":"admin"}');
    const saved = view.messages.find((m) => (m as { type: string }).type === 'saved');
    assert.ok(saved, 'a saved message should be posted');
    const reloaded = view.messages.find((m) => (m as { type: string }).type === 'loadData');
    assert.ok(reloaded, 'the panel should reload after saving');
  });

  it('compacts JSON display whitespace before saving while preserving string spaces', async () => {
    const loaded = await controller.load('/app/config');
    await controller.handleMessage({
      type: 'save',
      path: '/app/config',
      text: '{\n  "role": "site admin",\n  "enabled": true\n}',
      version: loaded.stat.version,
      displayMode: 'json',
    });

    assert.strictEqual(
      (await client.getData('/app/config')).data.toString('utf8'),
      '{"role":"site admin","enabled":true}',
    );
  });

  it('saves TXT mode exactly as edited without JSON normalization', async () => {
    const loaded = await controller.load('/app/config');
    const text = '{\n  "role": "admin"\n}\n';
    await controller.handleMessage({
      type: 'save',
      path: '/app/config',
      text,
      version: loaded.stat.version,
      displayMode: 'text',
    });

    assert.strictEqual((await client.getData('/app/config')).data.toString('utf8'), text);
  });

  it('rejects invalid JSON-mode edits instead of writing corrupted data', async () => {
    const loaded = await controller.load('/app/config');
    await controller.handleMessage({
      type: 'save',
      path: '/app/config',
      text: '{ broken json',
      version: loaded.stat.version,
      displayMode: 'json',
    });

    assert.strictEqual((await client.getData('/app/config')).data.toString('utf8'), '{"role":"web"}');
    const error = view.messages.find((message) => (message as { type: string }).type === 'error') as
      { message: string } | undefined;
    assert.match(error?.message ?? '', /Invalid JSON/);
  });

  it('reports a version conflict and does not overwrite data', async () => {
    const loaded = await controller.load('/app/config');
    const staleVersion = loaded.stat.version;
    await client.setData('/app/config', Buffer.from('{"changed":true}'), staleVersion);

    await controller.handleMessage({
      type: 'save',
      path: '/app/config',
      text: '{"clobber":true}',
      version: staleVersion,
    });

    const error = view.messages.find((m) => (m as { type: string }).type === 'error') as
      { message: string; code?: string } | undefined;
    assert.ok(error, 'an error message should be posted');
    assert.strictEqual(error?.code, ZkErrorCode.BAD_VERSION);
    assert.strictEqual((await client.getData('/app/config')).data.toString('utf8'), '{"changed":true}');
    assert.ok(
      notifyErrors.some(
        (entry) => entry.code === ZkErrorCode.BAD_VERSION && entry.message.includes('版本已变化'),
      ),
      'a version conflict should produce a notification',
    );
  });

  it('detects node deletion while the panel is open and blocks further saves', async () => {
    await controller.load('/app/config');
    await client.remove('/app/config');

    const error = view.messages.find((m) => (m as { type: string }).type === 'error') as
      { message: string; code?: string } | undefined;
    assert.ok(error, 'an error should be posted when the node is deleted');
    assert.strictEqual(error?.code, ZkErrorCode.NO_NODE);
    assert.deepStrictEqual(deletedPaths, ['/app/config']);
    assert.ok(notifyErrors.some((entry) => entry.code === ZkErrorCode.NO_NODE));

    await controller.handleMessage({ type: 'save', path: '/app/config', text: '{}', version: 0 });
    const blocked = [...view.messages].reverse().find((m) => (m as { type: string }).type === 'error') as
      { message: string } | undefined;
    assert.match(blocked?.message ?? '', /not been loaded/);
  });

  it('rejects save for a deleted node before writing', async () => {
    let setDataCalls = 0;
    const noWatch: DetailPanelDeps = {
      ...deps,
      watchNode: undefined,
      saveNodeData: (path, data, version) => {
        setDataCalls += 1;
        return client.setData(path, data, version);
      },
    };
    const local = new DetailPanelController(noWatch, view);
    const loaded = await local.load('/app/config');
    await client.remove('/app/config');

    await local.handleMessage({
      type: 'save',
      path: '/app/config',
      text: '{}',
      version: loaded.stat.version,
    });

    assert.strictEqual(setDataCalls, 0, 'the existence check should prevent the write');
    const error = view.messages.find((m) => (m as { type: string }).type === 'error') as
      { message: string; code?: string } | undefined;
    assert.strictEqual(error?.code, ZkErrorCode.NO_NODE);
    assert.ok(
      notifyErrors.some(
        (entry) => entry.code === ZkErrorCode.NO_NODE && entry.message.includes('节点已被删除'),
      ),
    );
  });

  it('notifies with a friendly message when save hits a deleted-node race', async () => {
    const racy: DetailPanelDeps = {
      ...deps,
      watchNode: undefined,
      nodeExists: async () => true,
    };
    const local = new DetailPanelController(racy, view);
    const loaded = await local.load('/app/config');
    await client.remove('/app/config');

    await local.handleMessage({
      type: 'save',
      path: '/app/config',
      text: '{}',
      version: loaded.stat.version,
    });

    assert.ok(
      notifyErrors.some(
        (entry) => entry.code === ZkErrorCode.NO_NODE && entry.message.includes('节点已被删除'),
      ),
    );
  });

  it('keeps watching for deletion after unrelated data changes', async () => {
    await controller.load('/app/config');
    const watchesBefore = watchCount;
    await client.setData('/app/config', Buffer.from('{"role":"web2"}'), 0);
    assert.ok(watchCount > watchesBefore, 'the watch should be re-armed after a change event');

    await client.remove('/app/config');
    assert.deepStrictEqual(deletedPaths, ['/app/config']);
  });

  it('rejects saves before load and incomplete messages', async () => {
    await controller.handleMessage({ type: 'save', path: '/app/config', text: '{}', version: 0 });
    const notLoaded = view.messages.find((m) => (m as { type: string }).type === 'error') as
      { message: string } | undefined;
    assert.match(notLoaded?.message ?? '', /not been loaded/);

    view.messages.length = 0;
    await controller.load('/app/config');
    await controller.handleMessage({ type: 'save', path: '/app/config' });
    const incomplete = view.messages.find((m) => (m as { type: string }).type === 'error') as
      { message: string } | undefined;
    assert.match(incomplete?.message ?? '', /missing path or data/);
  });

  it('handles unknown messages without crashing', async () => {
    await controller.handleMessage({ type: 'ping' });
    assert.strictEqual(view.messages.length, 0);
  });
});
