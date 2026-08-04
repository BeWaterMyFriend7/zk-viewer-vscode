const path = require('path');
const { runTests } = require('@vscode/test-electron');

// Default to the oldest supported VS Code so backward compatibility is
// verified on every run. Override with VSCODE_TEST_VERSION=stable|insiders|<version>.
const version = process.env.VSCODE_TEST_VERSION || '1.60.0';

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, '..', 'out', 'test', 'integration');

  // The mock client lets integration tests run without a real ZooKeeper server.
  process.env.ZK_VIEWER_USE_MOCK = '1';
  // Linux CI runners have no system keyring (gnome-keyring/libsecret), so
  // SecretStorage calls cannot persist. The wrapper degrades gracefully; this
  // flag lets integration tests assert platform-appropriate behavior.
  if (process.platform === 'linux') {
    process.env.ZK_VIEWER_TEST_NO_KEYRING = '1';
  }

  const launchArgs = ['--skip-welcome', '--skip-release-notes'];
  if (process.platform === 'linux') {
    launchArgs.push('--no-sandbox', '--disable-gpu');
  }

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs,
      version,
    });
  } catch (err) {
    console.error('Integration tests failed:', err);
    process.exit(1);
  }
}

main();
