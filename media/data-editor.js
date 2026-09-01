// @ts-check
// Shared node-data editor for detail and create panels.
// Exposed as window.zkDataEditor.create(options).
// options: { textareaId, messages, onChange }
// Fixed DOM ids used: #data, #display-json, #display-text, #toggle-wrap, #compact-json, #status
(function (global) {
  function createDataEditor(options) {
    options = options || {};
    var textarea = document.getElementById(options.textareaId || 'data');
    var displayJson = document.getElementById('display-json');
    var displayText = document.getElementById('display-text');
    var toggleWrapBtn = document.getElementById('toggle-wrap');
    var compactBtn = document.getElementById('compact-json');
    var status = document.getElementById('status');
    var displayModeGroup = document.querySelector('.segmented-control');
    var displayLabel = document.querySelector('.toolbar-label');

    var kind = 'text';
    var displayMode = 'json';
    var draftText = '';
    var lastRenderedText = '';
    var editable = false;
    var wrapEnabled = true;
    var messages = options.messages || {};
    var onChange = options.onChange || function () {};

    function fmt(template, replacements) {
      return Object.entries(replacements || {}).reduce(
        function (res, entry) { return res.replace('{' + entry[0] + '}', String(entry[1])); },
        template
      );
    }

    function compactJsonText(text) {
      JSON.parse(text);
      var result = '';
      var inString = false;
      var escaped = false;
      for (var i = 0; i < text.length; i += 1) {
        var char = text[i];
        if (inString) {
          result += char;
          if (escaped) { escaped = false; }
          else if (char === "\\") { escaped = true; }
          else if (char === '"') { inString = false; }
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
      var compact = compactJsonText(text);
      var result = '';
      var depth = 0;
      var inString = false;
      var escaped = false;
      function indent() { return new Array(depth + 1).join('  '); }
      for (var i = 0; i < compact.length; i += 1) {
        var char = compact[i];
        if (inString) {
          result += char;
          if (escaped) { escaped = false; }
          else if (char === "\\") { escaped = true; }
          else if (char === '"') { inString = false; }
        } else if (char === '"') {
          inString = true;
          result += char;
        } else if (char === '{' || char === '[') {
          result += char;
          depth += 1;
          var close = char === '{' ? '}' : ']';
          if (compact[i + 1] !== close) { result += '\n' + indent(); }
        } else if (char === '}' || char === ']') {
          depth -= 1;
          var open = char === '}' ? '{' : '[';
          if (compact[i - 1] !== open) { result += '\n' + indent(); }
          result += char;
        } else if (char === ',') {
          result += ',\n' + indent();
        } else if (char === ':') {
          result += ': ';
        } else {
          result += char;
        }
      }
      return result;
    }

    function showStatus(message, error) {
      if (status) { status.textContent = message || ''; status.classList.toggle('error', Boolean(error)); }
    }

    function updateDisplayButtons() {
      var isBinary = kind === 'binary';
      if (displayJson) { displayJson.disabled = isBinary; }
      if (displayText) { displayText.disabled = isBinary; }
      if (displayJson) {
        displayJson.classList.toggle('active', !isBinary && displayMode === 'json');
        displayJson.setAttribute('aria-pressed', String(!isBinary && displayMode === 'json'));
      }
      if (displayText) {
        displayText.classList.toggle('active', !isBinary && displayMode === 'text');
        displayText.setAttribute('aria-pressed', String(!isBinary && displayMode === 'text'));
      }
    }

    function normalStatus() {
      if (!editable) { showStatus(messages.kindReadOnly ? fmt(messages.kindReadOnly, { kind: kind }) : '', false); }
      else if (messages.readOnlyStatus) { showStatus(messages.readOnlyStatus, false); }
    }

    function renderDraft() {
      if (kind === 'binary' || displayMode === 'text') { textarea.value = draftText; lastRenderedText = textarea.value; normalStatus(); return; }
      try { textarea.value = formatJsonText(draftText); lastRenderedText = textarea.value; normalStatus(); }
      catch (error) { textarea.value = draftText; lastRenderedText = textarea.value; showStatus(fmt(messages.invalidJson || 'Invalid JSON: {detail}', { detail: error.message || String(error) }), true); }
    }

    function captureDraft() {
      if (textarea.value === lastRenderedText) { return true; }
      if (kind !== 'binary' && displayMode === 'json') {
        try { draftText = compactJsonText(textarea.value); return true; }
        catch (error) { draftText = textarea.value; showStatus(fmt(messages.invalidJson || 'Invalid JSON: {detail}', { detail: error.message || String(error) }), true); return false; }
      }
      draftText = textarea.value;
      return true;
    }

    function setDisplayMode(mode) { captureDraft(); displayMode = mode; updateDisplayButtons(); renderDraft(); onChange(); }

    function toggleWrap() {
      wrapEnabled = !wrapEnabled;
      textarea.wrap = wrapEnabled ? 'soft' : 'off';
      textarea.classList.toggle('no-wrap', !wrapEnabled);
      if (toggleWrapBtn) { toggleWrapBtn.textContent = wrapEnabled ? (messages.wrapOn || 'Wrap: On') : (messages.wrapOff || 'Wrap: Off'); toggleWrapBtn.setAttribute('aria-pressed', String(wrapEnabled)); }
    }

    function compact() {
      try { draftText = compactJsonText(textarea.value); displayMode = 'text'; updateDisplayButtons(); renderDraft(); showStatus(messages.minifySuccess || 'JSON whitespace removed', false); }
      catch (error) { showStatus(fmt(messages.minifyInvalid || 'Cannot minify invalid JSON: {detail}', { detail: error.message || String(error) }), true); }
    }

    function setValue(text, nextKind) {
      kind = nextKind || 'text';
      draftText = text || '';
      displayMode = kind === 'json' ? 'json' : 'text';
      updateDisplayButtons();
      renderDraft();
    }

    function getText() { if (!captureDraft()) { return null; } return draftText; }

    function setEditable(next) { editable = Boolean(next); textarea.disabled = !editable; if (compactBtn) { compactBtn.disabled = !editable; } normalStatus(); }

    function applyMessages(next) {
      messages = next || {};
      if (toggleWrapBtn) { toggleWrapBtn.textContent = wrapEnabled ? (messages.wrapOn || 'Wrap: On') : (messages.wrapOff || 'Wrap: Off'); }
      if (compactBtn) { compactBtn.textContent = messages.minifyJson || 'Minify JSON'; }
      if (displayLabel) { displayLabel.textContent = messages.displayLabel || 'Display'; }
      if (displayModeGroup) { displayModeGroup.setAttribute('aria-label', messages.displayModeAria || 'Display mode'); }
      if (textarea) { textarea.setAttribute('placeholder', messages.dataPlaceholder || ''); }
      normalStatus();
    }

    if (displayJson) { displayJson.addEventListener('click', function () { setDisplayMode('json'); }); }
    if (displayText) { displayText.addEventListener('click', function () { setDisplayMode('text'); }); }
    if (toggleWrapBtn) { toggleWrapBtn.addEventListener('click', toggleWrap); }
    if (compactBtn) { compactBtn.addEventListener('click', compact); }

    return {
      setValue: setValue,
      getText: getText,
      setEditable: setEditable,
      setMessages: applyMessages,
      setKind: function (nextKind) { kind = nextKind; updateDisplayButtons(); },
     focus: function () { textarea.focus(); },
     showStatus: showStatus
     ,getDisplayMode: function () { return displayMode; }
     ,getKind: function () { return kind; }
      ,wasChanged: function () { return textarea.value !== lastRenderedText; }
   };
  }

  global.zkDataEditor = { create: createDataEditor };
})(window);
