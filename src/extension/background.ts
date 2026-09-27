import browser from './browser';
declare const TARGET_BROWSER: 'chrome' | 'firefox';

// Keys stay in extension-local storage; Chrome content scripts cannot read it.
if (TARGET_BROWSER === 'chrome') {
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
    .catch(() => console.error('Haystack could not restrict local storage access.'));
}

browser.action.onClicked.addListener((tab) => {
  if (tab.windowId === undefined) return;
  const open = TARGET_BROWSER === 'firefox'
    ? browser.sidebarAction.open()
    : chrome.sidePanel.open({ windowId: tab.windowId });
  open.catch(() => console.error('Haystack could not open its panel. Click the extension icon again.'));
});
