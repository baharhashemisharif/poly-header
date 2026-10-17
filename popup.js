let rules = [];
let nextId = 1;
let paused = false;
let currentTab = null;
let saveTimer = null;

const $rules = document.getElementById('rules');
const $pause = document.getElementById('pause');

function blankRule() {
  return {
    id: nextId++,
    enabled: true,
    header: '',
    value: '',
    urlFilter: '',
    tabId: null,
    tabTitle: null,
  };
}

async function init() {
  [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const data = await chrome.storage.local.get({ rules: [], nextId: 1, paused: false });
  rules = data.rules;
  nextId = data.nextId;
  paused = data.paused;
  if (rules.length === 0) {
    rules.push(blankRule());
    save(true);
  }
  render();
}

function save(immediate = false) {
  clearTimeout(saveTimer);
  const write = () => chrome.storage.local.set({ rules, nextId, paused });
  if (immediate) write();
  else saveTimer = setTimeout(write, 250);
}

function render() {
  $rules.textContent = '';
  for (const rule of rules) $rules.appendChild(renderRule(rule));
  $pause.textContent = paused ? '▶ Resume' : '⏸ Pause all';
  $pause.classList.toggle('paused', paused);
  document.body.classList.toggle('all-paused', paused);
}

function renderRule(rule) {
  const row = document.createElement('div');
  row.className = 'rule' + (rule.enabled ? '' : ' disabled');

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = rule.enabled;
  toggle.title = 'Enable rule';
  toggle.addEventListener('change', () => {
    rule.enabled = toggle.checked;
    row.classList.toggle('disabled', !rule.enabled);
    save(true);
  });

  const header = textInput(rule, 'header', 'Header name');
  const value = textInput(rule, 'value', 'Value (empty = remove)');
  const urlFilter = textInput(rule, 'urlFilter', 'URL filter (all if empty)');

  const tabSel = document.createElement('select');
  tabSel.title = 'Tab filter';
  tabSel.append(new Option('All tabs', 'all'));
  tabSel.append(new Option('This tab', 'current'));
  if (rule.tabId && rule.tabId !== currentTab?.id) {
    const label = 'Tab: ' + (rule.tabTitle || rule.tabId);
    tabSel.append(new Option(label, 'pinned'));
    tabSel.value = 'pinned';
  } else {
    tabSel.value = rule.tabId ? 'current' : 'all';
  }
  tabSel.addEventListener('change', () => {
    if (tabSel.value === 'current' && currentTab) {
      rule.tabId = currentTab.id;
      rule.tabTitle = currentTab.title;
    } else if (tabSel.value === 'all') {
      rule.tabId = null;
      rule.tabTitle = null;
    }
    // Rebuild options so a stale "pinned" entry disappears.
    render();
    save(true);
  });

  const del = document.createElement('button');
  del.className = 'del';
  del.textContent = '✕';
  del.title = 'Delete rule';
  del.addEventListener('click', () => {
    rules = rules.filter((r) => r.id !== rule.id);
    if (rules.length === 0) rules.push(blankRule());
    render();
    save(true);
  });

  row.append(toggle, header, value, urlFilter, tabSel, del);
  return row;
}

function textInput(rule, key, placeholder) {
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;
  input.value = rule[key] || '';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.addEventListener('input', () => {
    rule[key] = input.value;
    save();
  });
  return input;
}

document.getElementById('add').addEventListener('click', () => {
  rules.push(blankRule());
  render();
  save(true);
  $rules.lastChild.querySelector('input[type="text"]').focus();
});

document.getElementById('export').addEventListener('click', () => {
  // Tab ids mean nothing outside this browser session, so drop them — and
  // export tab-pinned rules disabled, so importing never widens one to all tabs.
  const exported = rules
    .filter((r) => r.header && r.header.trim())
    .map(({ id, tabId, tabTitle, ...rest }) => (tabId ? { ...rest, enabled: false } : rest));
  const blob = new Blob([JSON.stringify({ rules: exported }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `polyheader-rules-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// A file picker would close the popup (it loses focus), so import by paste.
const $importPanel = document.getElementById('import-panel');
const $importText = document.getElementById('import-text');
const $importError = document.getElementById('import-error');

document.getElementById('import').addEventListener('click', () => {
  $importPanel.hidden = !$importPanel.hidden;
  $importError.textContent = '';
  if (!$importPanel.hidden) $importText.focus();
});

document.getElementById('import-cancel').addEventListener('click', () => {
  $importPanel.hidden = true;
  $importText.value = '';
});

document.getElementById('import-apply').addEventListener('click', () => {
  let imported;
  try {
    imported = parseImport($importText.value);
  } catch (e) {
    $importError.textContent = e.message;
    return;
  }
  // Replace the lone empty placeholder row rather than keeping it above the imports.
  if (rules.length === 1 && !rules[0].header.trim()) rules = [];
  for (const rule of imported) rules.push({ ...rule, id: nextId++ });
  $importPanel.hidden = true;
  $importText.value = '';
  render();
  save(true);
});

function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON.');
  }
  const list = Array.isArray(data) ? data : data?.rules;
  if (!Array.isArray(list)) throw new Error('Expected an array of rules or { "rules": [...] }.');
  const imported = list.map((item, i) => {
    if (!item || typeof item.header !== 'string' || !item.header.trim()) {
      throw new Error(`Rule ${i + 1} has no header name.`);
    }
    return {
      ...item,
      enabled: item.enabled !== false,
      value: typeof item.value === 'string' ? item.value : '',
      urlFilter: typeof item.urlFilter === 'string' ? item.urlFilter : '',
      tabId: null,
      tabTitle: null,
    };
  });
  if (!imported.length) throw new Error('No rules to import.');
  return imported;
}

$pause.addEventListener('click', () => {
  paused = !paused;
  render();
  save(true);
});

init();
