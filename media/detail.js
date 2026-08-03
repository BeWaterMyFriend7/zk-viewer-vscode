// @ts-check
(function () {
  const vscode = acquireVsCodeApi();
  const dataInput = document.getElementById('data');
  const saveButton = document.getElementById('save');
  const status = document.getElementById('status');
  const statBox = document.getElementById('stat');

  let currentPath;
  let currentVersion;

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
      dataInput.value = message.dataText;
      dataInput.disabled = !message.editable;
      saveButton.disabled = !message.editable;
      renderStat(message.stat);
      status.textContent = message.kind;
    } else if (message.type === 'saved') {
      status.textContent = 'Saved at version ' + currentVersion;
    } else if (message.type === 'error') {
      status.textContent = 'Error: ' + message.message;
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
