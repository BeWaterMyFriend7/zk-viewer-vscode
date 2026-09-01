// @ts-check
(function () {
  const vscode = acquireVsCodeApi();
  const form = document.getElementById('node-create-form');
  const nameInput = document.getElementById('n-name');
  const modeSelect = document.getElementById('n-mode');
  const errorBox = document.getElementById('node-create-error');
  const initial = window['zkViewerNodeCreateInitial'] || {};

  const editor = window.zkDataEditor.create({
    textareaId: 'data',
    messages: window['zkViewerDetailMessages'] || {},
    onChange: function () {},
  });
  editor.setEditable(true);
  editor.setValue(initial.data || '', detectKind(initial.data));

  function detectKind(text) {
    if (!text) { return 'text'; }
    try { JSON.parse(text); return 'json'; } catch (e) { return 'text'; }
  }

  function showError(message) {
    errorBox.textContent = message || '';
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = editor.getText();
    if (data === null) { return; }
    showError('');
    vscode.postMessage({
      type: 'create',
      name: nameInput.value,
      mode: modeSelect.value,
      data: data,
    });
  });

  document.getElementById('cancel-create').addEventListener('click', () => {
    vscode.postMessage({ type: 'cancel' });
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'nodeCreateError') {
      showError(message.message || '');
    }
  });
})();