(function () {
  const vscode = acquireVsCodeApi();
  document.getElementById('download-template').addEventListener('click', () => {
    vscode.postMessage({ command: 'download' });
  });
  document.getElementById('close-template').addEventListener('click', () => {
    vscode.postMessage({ command: 'close' });
  });
})();
