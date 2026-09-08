// @ts-check
(function () {
  const vscode = acquireVsCodeApi();
  const editButton = document.getElementById('edit');
  const saveButton = document.getElementById('save');
  const statBox = document.getElementById('stat');
  const statSummary = document.querySelector('.stat-summary');

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
    statSummary.textContent = messages.detailsSummary;
    editButton.textContent = messages.edit;
    saveButton.textContent = messages.save;
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
    const kibibytes = (Number(stat.dataLength) / 1024).toFixed(2);
    const owner = String(stat.ephemeralOwner ?? '').trim();
    const persistent =
      owner === '' ||
      owner === '0' ||
      (/^0x/i.test(owner) ? /^0*$/.test(owner.slice(2)) : Number(owner) === 0);
    const formatVersion = (templates, version) => {
      const key = Number(version) === 0 ? 'zero' : Number(version) === 1 ? 'one' : 'many';
      return formatMessage(templates[key], { version: version });
    };
    const fields = {
      ctime: formatTime(stat.ctime),
      mtime: formatTime(stat.mtime),
      dataLength: formatMessage(messages.dataSize, { bytes: stat.dataLength, kibibytes: kibibytes }),
      numChildren: formatMessage(
        Number(stat.numChildren) === 0 ? messages.leafNode : messages.childCount,
        { count: stat.numChildren },
      ),
      nodeType: persistent
        ? messages.persistentNode
        : formatMessage(messages.ephemeralNode, { sessionId: stat.ephemeralOwner }),
      version: formatVersion(messages.dataVersion, stat.version),
      cversion: formatVersion(messages.childVersion, stat.cversion),
      aversion: formatVersion(messages.aclVersion, stat.aversion),
      czxid: stat.czxid,
      mzxid: stat.mzxid,
    };
    statBox.replaceChildren();
    Object.entries(fields).forEach(([key, value]) => {
      const row = document.createElement('div');
      const label = document.createElement('span');
      const content = document.createElement('span');
      label.className = 'stat-label';
      label.textContent = messages.statLabels[key] || key;
      content.className = 'stat-value';
      content.textContent = String(value);
      row.append(label, content);
      statBox.append(row);
    });
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
