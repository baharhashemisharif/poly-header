const ALL_RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font',
  'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket',
  'webtransport', 'webbundle', 'other',
];

function toDnrRule(rule) {
  const header = rule.header.trim();
  const condition = { resourceTypes: ALL_RESOURCE_TYPES };
  if (rule.urlFilter && rule.urlFilter.trim()) condition.urlFilter = rule.urlFilter.trim();
  if (rule.tabId) condition.tabIds = [rule.tabId];

  return {
    id: rule.id,
    priority: 1,
    condition,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        rule.value
          ? { header, operation: 'set', value: rule.value }
          : { header, operation: 'remove' },
      ],
    },
  };
}

async function rebuild() {
  const { rules = [], paused = false } = await chrome.storage.local.get(['rules', 'paused']);
  const existing = await chrome.declarativeNetRequest.getSessionRules();

  const active = paused ? [] : rules.filter((r) => r.enabled && r.header && r.header.trim());
  const addRules = active.map(toDnrRule);

  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: existing.map((r) => r.id),
      addRules,
    });
  } catch (e) {
    // One bad rule (e.g. malformed urlFilter) rejects the whole batch —
    // retry one by one so the rest still apply.
    console.warn('Batch update failed, retrying per rule:', e.message);
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: existing.map((r) => r.id),
    });
    for (const dnr of addRules) {
      try {
        await chrome.declarativeNetRequest.updateSessionRules({ addRules: [dnr] });
      } catch (err) {
        console.error(`Rule ${dnr.id} rejected:`, err.message);
      }
    }
  }

  const applied = (await chrome.declarativeNetRequest.getSessionRules()).length;
  if (paused) {
    chrome.action.setBadgeText({ text: 'off' });
    chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
  } else {
    chrome.action.setBadgeText({ text: applied ? String(applied) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.rules || changes.paused)) rebuild();
});

// Tab ids are meaningless after a restart — disable tab-scoped rules rather
// than let them silently match whatever new tab reuses the id.
chrome.runtime.onStartup.addListener(async () => {
  const { rules = [] } = await chrome.storage.local.get('rules');
  let changed = false;
  for (const r of rules) {
    if (r.tabId) {
      r.tabId = null;
      r.tabTitle = null;
      r.enabled = false;
      changed = true;
    }
  }
  if (changed) await chrome.storage.local.set({ rules });
  else rebuild();
});

chrome.runtime.onInstalled.addListener(rebuild);

// When a pinned tab closes, disable its rules instead of widening them to all tabs.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { rules = [] } = await chrome.storage.local.get('rules');
  let changed = false;
  for (const r of rules) {
    if (r.tabId === tabId) {
      r.tabId = null;
      r.tabTitle = null;
      r.enabled = false;
      changed = true;
    }
  }
  if (changed) await chrome.storage.local.set({ rules });
});
