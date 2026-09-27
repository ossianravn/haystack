import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { unzipSync, strFromU8 } from 'fflate';

test('release archives contain only extension files, with correct platform manifests and no development key', async () => {
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  let key = '';
  try { key = parseEnv(await readFile('.env', 'utf8')).TYPESAFE_API_KEY ?? ''; }
  catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  for (const target of ['chrome', 'firefox']) {
    const zip = unzipSync(await readFile(`artifacts/haystack-${target}-${version}.zip`));
    const names = Object.keys(zip);
    assert.ok(names.every((name) => /^(LICENSES\.txt|manifest\.json|background\.js|content\.js|panel\.html|options\.html|assets\/[\w.-]+\.(m?js|css)|icons\/haystack-\d+\.png|pdf-assets\/(cmaps|standard_fonts)\/[\w.-]+)$/.test(name)));
    const manifest = JSON.parse(strFromU8(zip['manifest.json']));
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.version, version);
    assert.ok(names.some((name) => /pdf\.worker.*\.mjs$/.test(name)), 'The PDF worker must be bundled locally.');
    assert.deepEqual(manifest.host_permissions, ['https://api.typesafe.ai/*']);
    assert.ok(manifest.permissions.includes('activeTab'));
    assert.equal(manifest.content_scripts, undefined);
    if (target === 'chrome') assert.equal(manifest.background.service_worker, 'background.js');
    else {
      assert.deepEqual(manifest.background.scripts, ['background.js']);
      assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, '149.0');
      assert.ok(manifest.browser_specific_settings.gecko.data_collection_permissions.required.includes('websiteContent'));
    }
    for (const name of names.filter((name) => /\.(m?js|html|json|css)$/.test(name))) {
      const contents = strFromU8(zip[name]);
      if (key) assert.equal(contents.includes(key), false, 'Development API key must never be packaged');
      assert.ok(!contents.includes('preview-only') && !contents.includes('ai-gateway.vercel.sh'));
    }
  }
});
