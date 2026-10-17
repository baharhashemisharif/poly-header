let rules = [];
let nextId = 1;
let paused = false;
let currentTab = null;
let saveTimer = null;
// The active profile's rules live in `rules` (what the worker applies);
// the others are parked in `profiles` by name.
let profiles = {};
let activeProfile = 'Default';

const $rules = document.getElementById('rules');
const $pause = document.getElementById('pause');
const $profile = document.getElementById('profile');
const $profileName = document.getElementById('profile-name');
const $profileDelete = document.getElementById('profile-delete');
const NEW_PROFILE = '\u0000new';

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
  const data = await chrome.storage.local.get({
    rules: [], nextId: 1, paused: false, profiles: {}, activeProfile: 'Default',
  });
  rules = data.rules;
  nextId = data.nextId;
  paused = data.paused;
  profiles = data.profiles;
  activeProfile = data.activeProfile;
  if (rules.length === 0) {
    rules.push(blankRule());
    save(true);
  }
  render();
}

function save(immediate = false) {
  clearTimeout(saveTimer);
  const write = () => chrome.storage.local.set({ rules, nextId, paused, profiles, activeProfile });
  if (immediate) write();
  else saveTimer = setTimeout(write, 250);
}

function render() {
  $rules.textContent = '';
  for (const rule of rules) $rules.appendChild(renderRule(rule));
  renderProfiles();
  $pause.textContent = paused ? '▶ Resume' : '⏸ Pause all';
  $pause.classList.toggle('paused', paused);
  document.body.classList.toggle('all-paused', paused);
}

function renderProfiles() {
  const names = [activeProfile, ...Object.keys(profiles)].sort((a, b) => a.localeCompare(b));
  $profile.textContent = '';
  for (const name of names) $profile.append(new Option(name, name));
  $profile.append(new Option('+ New profile…', NEW_PROFILE));
  $profile.value = activeProfile;
  $profileDelete.hidden = names.length < 2;
  resetDeleteButton();
}

function switchProfile(name, fresh = false) {
  profiles[activeProfile] = rules;
  rules = fresh ? [blankRule()] : profiles[name];
  delete profiles[name];
  activeProfile = name;
  render();
  save(true);
}

let deleteArmed = null;
function resetDeleteButton() {
  clearTimeout(deleteArmed);
  deleteArmed = null;
  $profileDelete.textContent = 'Delete';
  $profileDelete.classList.remove('armed');
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

$profile.addEventListener('change', () => {
  if ($profile.value === NEW_PROFILE) {
    $profile.hidden = true;
    $profileName.hidden = false;
    $profileName.value = '';
    $profileName.focus();
    return;
  }
  switchProfile($profile.value);
});

function closeNameInput() {
  $profileName.hidden = true;
  $profile.hidden = false;
  $profileName.classList.remove('invalid');
  $profile.value = activeProfile;
}

$profileName.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeNameInput();
  } else if (e.key === 'Enter') {
    const name = $profileName.value.trim();
    if (!name || name === activeProfile || name in profiles) {
      $profileName.classList.add('invalid');
      return;
    }
    closeNameInput();
    switchProfile(name, true);
  }
});
$profileName.addEventListener('blur', () => {
  if (!$profileName.hidden) closeNameInput();
});

// Deleting a profile drops its rules, so ask for a second click.
$profileDelete.addEventListener('click', () => {
  if (!deleteArmed) {
    $profileDelete.textContent = `Delete "${activeProfile}"?`;
    $profileDelete.classList.add('armed');
    deleteArmed = setTimeout(resetDeleteButton, 3000);
    return;
  }
  const [next] = Object.keys(profiles).sort((a, b) => a.localeCompare(b));
  rules = profiles[next];
  delete profiles[next];
  activeProfile = next;
  render();
  save(true);
});

$pause.addEventListener('click', () => {
  paused = !paused;
  render();
  save(true);
});

init();
