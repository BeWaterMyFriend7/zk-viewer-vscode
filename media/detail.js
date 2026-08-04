// @ts-check
(function () {
  const vscode = acquireVsCodeApi();
  const dataInput = document.getElementById('data');
  const editButton = document.getElementById('edit');
  const saveButton = document.getElementById('save');
  const status = document.getElementById('status');
  const statBox = document.getElementById('stat');

  let currentPath;
  let currentVersion;
  let dataEditable = false;

  function setEditing(enabled) {
    dataInput.disabled = !enabled;
    saveButton.disabled = !enabled;
    editButton.disabled = enabled;
    status.textContent = enabled ? 'Editing — changes apply on Save' : 'Read-only';
  }

  function renderStat(stat) {
    const fields = {
      path: currentPath,
      version: stat.version,
      cversion: stat.cversion,
      aversion: stat.aversion,
      dataLength: stat.dataLength,
      numChildren: stat.numChildren,
      ephemeralOwner: stat.ephemeralOwner,
      mtime: stat.mtime,
      ctime: stat.ctime,
      czxid: stat.czxid,
      mzxid: stat.mzxid,
    };
    statBox.innerHTML = Object.entries(fields)
      .map(([key, value]) => `<span><b>${key}</b>: ${value}</span>`)
      .join('');
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'loadData') {
      currentPath = message.path;
      currentVersion = message.stat.version;
      dataEditable = message.editable;
      dataInput.value = message.dataText;
      editButton.disabled = !message.editable;
      setEditing(false);
      renderStat(message.stat);
      status.textContent = message.editable ? 'Read-only — click Edit to modify' : message.kind + ' (read-only)';
    } else if (message.type === 'saved') {
      status.textContent = 'Saved at version ' + currentVersion;
      setEditing(false);
    } else if (message.type === 'error') {
      status.textContent = 'Error: ' + message.message;
    }
  });

  editButton.addEventListener('click', () => {
    if (dataEditable) {
      setEditing(true);
    }
  });

  saveButton.addEventListener('click', () => {
    vscode.postMessage({
      type: 'save',
      path: currentPath,
      text: dataInput.value,
      version: currentVersion,
    });
  });
})();
