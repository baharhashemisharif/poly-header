# PolyHeader

PolyHeader — a minimal local replacement for ModHeader. Multiple request-header rules, each with an optional URL filter and tab filter. No network access, no analytics, no auto-updates.

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this folder

## Usage

- **+ Add** creates a rule: header name, value, URL filter, tab filter.
- Empty **value** = remove the header from requests instead of setting it.
- **URL filter** is a [DNR urlFilter](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest#url_filter_syntax): plain substring (`api.example.com`), `*` wildcards, or `||example.com` to anchor to a domain. Empty = all URLs.
- **Tab filter**: "All tabs" or "This tab" (the tab active when you opened the popup). When a pinned tab closes — or the browser restarts — its rules are disabled automatically so headers never leak to other tabs.
- The badge on the icon shows how many rules apply to the current tab (rules for all tabs plus any pinned to it).

## Notes

- Rules are applied via `declarativeNetRequest` **session rules** (the only kind that supports tab filtering) and re-applied from storage by the service worker, so they survive service-worker restarts.
- If a rule has a malformed URL filter, the other rules still apply; the bad one is logged in the service-worker console (`chrome://extensions` → "Inspect views: service worker").
