// @ts-check
(function () {
  const vscode = acquireVsCodeApi();
  const dataInput = document.getElementById('data');
  const editButton = document.getElementById('edit');
  const saveButton = document.getElementById('save');
  const displayJsonButton = document.getElementById('display-json');
  const displayTextButton = document.getElementById('display-text');
  const toggleWrapButton = document.getElementById('toggle-wrap');
  const compactJsonButton = document.getElementById('compact-json');
  const status = document.getElementById('status');
  const statBox = document.getElementById('stat');
  const statHeading = document.getElementById('stat-heading');
  const dataHeading = document.getElementById('data-heading');
  const displayLabel = document.querySelector('.toolbar-label');
  const displayModeGroup = document.querySelector('.segmented-control');
  const eyebrow = document.querySelector('.eyebrow');

  let currentPath;
  let currentVersion;
  let currentStat;
  let currentKind = 'text';
  let currentDisplayMode = 'json';
  let draftText = '';
  let lastRenderedText = '';
  let dataEditable = false;
  let editing = false;
  let wrapEnabled = true;
  let messages = window['zkViewerDetailMessages'];

  function formatMessage(template, replacements) {
    return Object.entries(replacements).reduce(
      (result, [key, value]) => result.replace(`{${key}}`, String(value)),
      template,
    );
  }

  function applyLanguage(nextMessages) {
    messages = nextMessages;
    document.documentElement.lang = messages.htmlLanguage;
    document.title = messages.documentTitle;
    eyebrow.textContent = messages.eyebrow;
    statHeading.textContent = messages.informationHeading;
    dataHeading.textContent = messages.dataHeading;
    displayLabel.textContent = messages.displayLabel;
    displayModeGroup.setAttribute('aria-label', messages.displayModeAria);
    dataInput.setAttribute('placeholder', messages.dataPlaceholder);
    editButton.textContent = messages.edit;
    saveButton.textContent = messages.save;
    compactJsonButton.textContent = messages.minifyJson;
    toggleWrapButton.textContent = wrapEnabled ? messages.wrapOn : messages.wrapOff;
    if (currentPath) {
      normalStatus();
    }
  }

  function showStatus(message, error) {
    status.textContent = message;
    status.classList.toggle('error', Boolean(error));
  }

  function updateDisplayButtons() {
    const binary = currentKind === 'binary';
    displayJsonButton.disabled = binary;
    displayTextButton.disabled = binary;
    displayJsonButton.classList.toggle('active', !binary && currentDisplayMode === 'json');
    displayTextButton.classList.toggle('active', !binary && currentDisplayMode === 'text');
    displayJsonButton.setAttribute('aria-pressed', String(!binary && currentDisplayMode === 'json'));
    displayTextButton.setAttribute('aria-pressed', String(!binary && currentDisplayMode === 'text'));
  }

  function normalStatus() {
    if (!dataEditable) {
      showStatus(formatMessage(messages.kindReadOnly, { kind: currentKind }), false);
    } else if (editing) {
      showStatus(messages.editingStatus, false);
    } else {
      showStatus(messages.readOnlyStatus, false);
    }
  }

  function compactJsonText(text) {
    JSON.parse(text);
    let result = '';
    let inString = false;
    let escaped = false;
    for (const char of text) {
      if (inString) {
        result += char;
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
      } else if (char === '"') {
        inString = true;
        result += char;
      } else if (char !== ' ' && char !== '\t' && char !== '\r' && char !== '\n') {
        result += char;
      }
    }
    return result;
  }

  function formatJsonText(text) {
    const compact = compactJsonText(text);
    let result = '';
    let depth = 0;
    let inString = false;
    let escaped = false;
    const indentation = () => '  '.repeat(depth);
    for (let index = 0; index < compact.length; index += 1) {
      const char = compact[index];
      if (inString) {
        result += char;
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
      } else if (char === '"') {
        inString = true;
        result += char;
      } else if (char === '{' || char === '[') {
        result += char;
        depth += 1;
        const closing = char === '{' ? '}' : ']';
        if (compact[index + 1] !== closing) {
          result += '\n' + indentation();
        }
      } else if (char === '}' || char === ']') {
        depth -= 1;
        const opening = char === '}' ? '{' : '[';
        if (compact[index - 1] !== opening) {
          result += '\n' + indentation();
        }
        result += char;
      } else if (char === ',') {
        result += ',\n' + indentation();
      } else if (char === ':') {
        result += ': ';
      } else {
        result += char;
      }
    }
    return result;
  }

  function renderDraft() {
    if (currentKind === 'binary' || currentDisplayMode === 'text') {
      dataInput.value = draftText;
      lastRenderedText = dataInput.value;
      normalStatus();
      return;
    }
    try {
      dataInput.value = formatJsonText(draftText);
      lastRenderedText = dataInput.value;
      normalStatus();
    } catch (error) {
      dataInput.value = draftText;
      lastRenderedText = dataInput.value;
      showStatus(
        formatMessage(messages.invalidJson, {
          detail: error instanceof Error ? error.message : String(error),
        }),
        true,
      );
    }
  }

  function captureDraft() {
    if (dataInput.value === lastRenderedText) {
      return true;
    }
    if (currentKind !== 'binary' && currentDisplayMode === 'json') {
      try {
        draftText = compactJsonText(dataInput.value);
        return true;
      } catch (error) {
        draftText = dataInput.value;
        showStatus(
          formatMessage(messages.invalidJson, {
            detail: error instanceof Error ? error.message : String(error),
          }),
          true,
        );
        return false;
      }
    }
    draftText = dataInput.value;
    return true;
  }

  function setDisplayMode(mode) {
    if (editing) {
      captureDraft();
    }
    currentDisplayMode = mode;
    updateDisplayButtons();
    renderDraft();
  }

  function setEditing(enabled) {
    editing = enabled;
    dataInput.disabled = !enabled;
    saveButton.disabled = !enabled;
    editButton.disabled = enabled || !dataEditable;
    compactJsonButton.disabled = !enabled || !dataEditable;
    normalStatus();
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
      .map(([key, value]) => `<span><b>${messages.statLabels[key] ?? key}</b>: ${value}</span>`)
      .join('');
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'languageChanged') {
      applyLanguage(message.messages);
      if (currentStat) {
        renderStat(currentStat);
      }
    } else if (message.type === 'loadData') {
      currentPath = message.path;
      currentVersion = message.stat.version;
      currentStat = message.stat;
      currentKind = message.kind;
      dataEditable = message.editable;
      draftText = message.dataText;
      currentDisplayMode = message.kind === 'json' ? 'json' : 'text';
      editButton.disabled = !message.editable;
      updateDisplayButtons();
      setEditing(false);
      dataInput.value = message.displayText;
      lastRenderedText = dataInput.value;
      renderStat(message.stat);
    } else if (message.type === 'saved') {
      setEditing(false);
      showStatus(formatMessage(messages.savedAtVersion, { version: currentVersion }), false);
    } else if (message.type === 'error') {
      showStatus(formatMessage(messages.error, { detail: message.message }), true);
    }
  });

  editButton.addEventListener('click', () => {
    if (dataEditable) {
      setEditing(true);
    }
  });

  saveButton.addEventListener('click', () => {
    const editorChanged = dataInput.value !== lastRenderedText;
    if (!captureDraft()) {
      return;
    }
    vscode.postMessage({
      type: 'save',
      path: currentPath,
      text: draftText,
      version: currentVersion,
      displayMode: editorChanged ? currentDisplayMode : 'text',
    });
  });

  displayJsonButton.addEventListener('click', () => setDisplayMode('json'));
  displayTextButton.addEventListener('click', () => setDisplayMode('text'));

  toggleWrapButton.addEventListener('click', () => {
    wrapEnabled = !wrapEnabled;
    dataInput.wrap = wrapEnabled ? 'soft' : 'off';
    dataInput.classList.toggle('no-wrap', !wrapEnabled);
    toggleWrapButton.textContent = wrapEnabled ? messages.wrapOn : messages.wrapOff;
    toggleWrapButton.setAttribute('aria-pressed', String(wrapEnabled));
  });

  compactJsonButton.addEventListener('click', () => {
    try {
      draftText = compactJsonText(dataInput.value);
      currentDisplayMode = 'text';
      updateDisplayButtons();
      renderDraft();
      showStatus(messages.minifySuccess, false);
    } catch (error) {
      showStatus(
        formatMessage(messages.minifyInvalid, {
          detail: error instanceof Error ? error.message : String(error),
        }),
        true,
      );
    }
  });
})();
