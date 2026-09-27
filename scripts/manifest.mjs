export function manifest(browser, version) {
  const icons = Object.fromEntries([16, 32, 48, 128].map((size) => [size, `icons/haystack-${size}.png`]));
  const common = {
    manifest_version: 3,
    name: 'Haystack — find the thought',
    version,
    description: 'Find relevant passages with your TypeSafe key. Highlight source text and copy or save every match as Markdown.',
    permissions: ['activeTab', 'scripting', 'storage', 'clipboardWrite', 'downloads'],
    host_permissions: ['https://api.typesafe.ai/*'],
    action: { default_title: 'Find with Haystack', default_icon: icons },
    options_ui: { page: 'options.html', open_in_tab: true },
    commands: { _execute_action: { suggested_key: { default: 'Ctrl+Shift+Y', mac: 'Command+Shift+Y' }, description: 'Open Haystack' } },
    content_security_policy: { extension_pages: "script-src 'self'; worker-src 'self'; object-src 'none'; connect-src 'self' https: http: file:; base-uri 'none'" },
    icons,
  };
  return browser === 'chrome' ? {
    ...common,
    description: 'Find relevant passages with Chrome’s local model or your TypeSafe key. Highlight, copy and save matches as Markdown.',
    permissions: [...common.permissions, 'sidePanel'],
    minimum_chrome_version: '125',
    background: { service_worker: 'background.js' },
    side_panel: { default_path: 'panel.html' },
  } : {
    ...common,
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    background: { scripts: ['background.js'] },
    sidebar_action: { default_panel: 'panel.html', default_title: 'Haystack', default_icon: icons },
    browser_specific_settings: { gecko: {
      id: 'haystack@extension.local', strict_min_version: '149.0',
      data_collection_permissions: { required: ['websiteContent', 'searchTerms', 'authenticationInfo'] },
    } },
  };
}
