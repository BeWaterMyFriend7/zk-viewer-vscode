// @ts-check
// Connection form webview. Reads the initial state from the panel host,
// collects the fields on submit, and posts a save/cancel message back.
(function () {
  const vscode = acquireVsCodeApi();
  const form = document.getElementById('connection-form');
  const nameInput = document.getElementById('f-name');
  const hostsInput = document.getElementById('f-hosts');
  const chrootInput = document.getElementById('f-chroot');
  const usernameInput = document.getElementById('f-username');
  const passwordInput = document.getElementById('f-password');
  const secureSelect = document.getElementById('f-secure');
  const timeoutInput = document.getElementById('f-timeout');
  const errorBox = document.getElementById('form-error');
  const cancelButton = document.getElementById('cancel');
  const testButton = document.getElementById('test-connection');

  function showError(message) {
    errorBox.textContent = message || '';
  }

  function collectState() {
    const secure = secureSelect.value === 'yes';
    const rawTimeout = Number(timeoutInput.value);
    return {
      name: nameInput.value || '',
      hosts: hostsInput.value || '',
      chroot: chrootInput.value || '',
      username: usernameInput.value || '',
      secure,
      sessionTimeoutMs: Number.isFinite(rawTimeout) ? rawTimeout : undefined,
    };
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const state = collectState();
    showError('');
    // Send the password only when the user typed something; an empty field
    // in edit mode keeps the existing stored secret.
    const typed = passwordInput.value;
    vscode.postMessage({
      type: 'save',
      state,
      newPassword: typed === '' ? undefined : typed,
    });
  });

  cancelButton.addEventListener('click', () => {
    vscode.postMessage({ type: 'cancel' });
  });

  if (testButton) {
    testButton.addEventListener('click', () => {
      const state = collectState();
      showError('');
      testButton.disabled = true;
      testButton.textContent = '...';
      const typed = passwordInput.value;
      vscode.postMessage({
        type: 'test',
        state,
        newPassword: typed === '' ? undefined : typed,
      });
    });
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'error') {
      showError(message.message || '');
      hostsInput.focus();
    } else if (message.type === 'testResult') {
      showError(message.message || '');
      if (testButton) {
        testButton.disabled = false;
        testButton.textContent = testButtonText();
      }
    }
  });

  if (testButton) {
    testButton.textContent = testButtonText();
  }

  function testButtonText() {
    const label = window['zkViewerConnectionFormMessages'] || {};
    return label.testConnectionButton || 'Test Connection';
  }
})();
