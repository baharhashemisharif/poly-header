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
  saveTimer = null;
  const write = () => {
    saveTimer = null;
    chrome.storage.local.set({ rules, nextId, paused });
  };
  if (immediate) write();
  else saveTimer = setTimeout(write, 250);
}

// The popup is torn down as soon as it loses focus, which kills a pending
// debounced save — flush it so the last keystrokes aren't dropped.
function flushSave() {
  if (saveTimer) save(true);
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

window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});

$pause.addEventListener('click', () => {
  paused = !paused;
  render();
  save(true);
});

init();
