import * as assert from 'assert';
import { buildNodeDetailTitle } from '../../src/webview/node-detail-title';

describe('buildNodeDetailTitle', () => {
  it('keeps paths with at most two segments unchanged', () => {
    assert.strictEqual(buildNodeDetailTitle('/'), '/');
    assert.strictEqual(buildNodeDetailTitle('/service'), '/service');
    assert.strictEqual(buildNodeDetailTitle('/service/1.0'), '/service/1.0');
  });

  it('shows only the parent and current node for deeper paths', () => {
    assert.strictEqual(
      buildNodeDetailTitle('/dayugvm-uat/sg/modules/SGC/SGC-BASIC-PROVIDER/demo-basic-time-service/1.0'),
      '.../demo-basic-time-service/1.0',
    );
  });
});
