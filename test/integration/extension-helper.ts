import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_NAME = 'zk-viewer-vscode';

/**
 * Resolve the extension by its stable package name rather than its publisher-qualified ID.
 * The publisher is part of the Marketplace ID and may change between local and published builds.
 */
export function getExtension(): vscode.Extension<unknown> {
  const extension =
    vscode.extensions.all.find((candidate) => candidate.packageJSON?.name === EXTENSION_NAME) ??
    vscode.extensions.all.find((candidate) => candidate.id.toLowerCase().endsWith(`.${EXTENSION_NAME}`));

  const available = vscode.extensions.all.map((candidate) => candidate.id).join(', ');
  assert.ok(extension, `extension should be installed. Available: ${available}`);
  return extension!;
}

export async function activateExtension(): Promise<vscode.Extension<unknown>> {
  const extension = getExtension();
  await extension.activate();
  return extension;
}
