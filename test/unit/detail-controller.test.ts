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

  beforeEach(async () => {
    client = new MockZkClient();
    await client.connect();
    await client.create('/app', Buffer.alloc(0), 'PERSISTENT');
    await client.create('/app/config', Buffer.from('{"role":"web"}'), 'PERSISTENT');
    view = new CapturingView();
    deps = {
      getNodeData: (path) => client.getData(path),
      saveNodeData: (path, data, version) => client.setData(path, data, version),
    };
    controller = new DetailPanelController(deps, view);
  });

  it('loadData returns stat and formatted data', async () => {
    const message = await controller.load('/app/config');
    assert.strictEqual(message.type, 'loadData');
    assert.strictEqual(message.path, '/app/config');
    assert.strictEqual(message.kind, 'json');
    assert.strictEqual(message.dataText, '{\n  "role": "web"\n}');
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
