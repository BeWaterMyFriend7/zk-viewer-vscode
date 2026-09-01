// @ts-check
(function () {
  const vscode = acquireVsCodeApi();
  const editButton = document.getElementById('edit');
  const saveButton = document.getElementById('save');
  const statBox = document.getElementById('stat');
  const statHeading = document.getElementById('stat-heading');
  const dataHeading = document.getElementById('data-heading');
  const eyebrow = document.querySelector('.eyebrow');

  let currentPath;
  let currentVersion;
  let currentStat;
  let currentKind = 'text';
  let dataEditable = false;
  let messages = window['zkViewerDetailMessages'];
  let editor;

  function formatMessage(template, replacements) {
    return Object.entries(replacements || {}).reduce(
      (result, [key, value]) => result.replace('{' + key + '}', String(value)),
      template,
    );
  }

  function normalStatus() {
    if (!dataEditable) {
      editor.showStatus(formatMessage(messages.kindReadOnly, { kind: currentKind }), false);
    } else {
      editor.showStatus(messages.readOnlyStatus, false);
    }
  }

  function applyLanguage(nextMessages) {
    messages = nextMessages;
    document.documentElement.lang = messages.htmlLanguage;
    document.title = messages.documentTitle;
    eyebrow.textContent = messages.eyebrow;
    statHeading.textContent = messages.informationHeading;
    dataHeading.textContent = messages.dataHeading;
    editor.setMessages(messages);
  }

  function renderStat(stat) {
    const formatTime = (value) => {
      const numeric = Number(value);
      const ms = Number.isFinite(numeric) ? numeric : Date.parse(String(value));
      if (!Number.isFinite(ms)) { return value; }
      const date = new Date(ms);
      if (Number.isNaN(date.getTime())) { return value; }
      const pad = (n) => n.toString().padStart(2, '0');
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
    };
    const fields = {
      path: currentPath,
      version: stat.version,
      cversion: stat.cversion,
      aversion: stat.aversion,
      dataLength: stat.dataLength,
      numChildren: stat.numChildren,
      ephemeralOwner: stat.ephemeralOwner,
      mtime: formatTime(stat.mtime),
      ctime: formatTime(stat.ctime),
      czxid: stat.czxid,
      mzxid: stat.mzxid,
    };
    statBox.innerHTML = Object.entries(fields)
      .map(([key, value]) => '<span><b>' + (messages.statLabels[key] || key) + '</b>: ' + value + '</span>')
      .join('');
  }

  function setEditing(enabled) {
    editor.setEditable(enabled);
    saveButton.disabled = !enabled;
    editButton.disabled = enabled || !dataEditable;
    normalStatus();
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'languageChanged') {
      applyLanguage(message.messages);
      if (currentStat) { renderStat(currentStat); }
    } else if (message.type === 'loadData') {
      currentPath = message.path;
      currentVersion = message.stat.version;
      currentStat = message.stat;
      currentKind = message.kind;
      dataEditable = message.editable;
      editor.setValue(message.dataText, message.kind);
      setEditing(false);
      renderStat(message.stat);
    } else if (message.type === 'saved') {
      setEditing(false);
      editor.showStatus(formatMessage(messages.savedAtVersion, { version: currentVersion }), false);
    } else if (message.type === 'error') {
      editor.showStatus(formatMessage(messages.error, { detail: message.message }), true);
    }
  });

  editButton.addEventListener('click', () => {
    if (dataEditable) { setEditing(true); }
  });

  saveButton.addEventListener('click', () => {
    const text = editor.getText();
    if (text === null) { return; }
    const displayMode = editor.getDisplayMode();
    const changed = editor.wasChanged();
    vscode.postMessage({
      type: 'save',
      path: currentPath,
      text: text,
      version: currentVersion,
      displayMode: changed ? displayMode : 'text',
    });
  });

  editor = window.zkDataEditor.create({ textareaId: 'data', messages: messages, onChange: function () {} });
})();