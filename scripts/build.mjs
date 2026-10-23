import { build as viteBuild } from 'vite';
import { build as esbuild } from 'esbuild';
import { cp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { zipSync } from 'fflate';
import { manifest } from './manifest.mjs';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
await viteBuild();
// The 16px toolbar icon uses a simplified three-line mark that stays legible at that size.
const logo = await readFile('src/icons/haystack.svg');
const smallLogo = await readFile('src/icons/haystack-16.svg');
await mkdir('artifacts', { recursive: true });
const licensePackages = ['react', 'react-dom', 'scheduler', '@base-ui/react', '@base-ui/utils',
  'class-variance-authority', 'clsx', 'tailwind-merge', 'lucide-react', 'webextension-polyfill', 'pdfjs-dist'];
const licenseTexts = [await readFile('THIRD_PARTY_NOTICES.md', 'utf8')];
for (const dependency of licensePackages) {
  const files = await readdir(`node_modules/${dependency}`);
  const license = files.find((file) => /^licen[cs]e(?:\.\w+)?$/i.test(file));
  if (!license) throw new Error(`Missing license for ${dependency}`);
  licenseTexts.push(`${dependency}\n\n${await readFile(`node_modules/${dependency}/${license}`, 'utf8')}`);
}
for (const browser of ['chrome', 'firefox']) {
  const out = `dist/${browser}`;
  const target = path.resolve(out);
  if (path.dirname(target) !== path.resolve('dist')) throw new Error('Invalid build output directory.');
  await rm(target, { recursive: true, force: true });
  await mkdir(`${out}/icons`, { recursive: true });
  await cp('dist/ui', out, { recursive: true });
  for (const directory of ['cmaps', 'standard_fonts']) {
    await cp(`node_modules/pdfjs-dist/${directory}`, `${out}/pdf-assets/${directory}`, { recursive: true });
  }
  await esbuild({ entryPoints: ['src/extension/background.ts', 'src/extension/content.ts'],
    bundle: true, outdir: out, format: 'iife', target: ['chrome125', 'firefox149'], minify: true,
    define: { TARGET_BROWSER: JSON.stringify(browser) } });
  await writeFile(`${out}/manifest.json`, JSON.stringify(manifest(browser, version), null, 2));
  await writeFile(`${out}/LICENSES.txt`, licenseTexts.join('\n\n---\n\n'));
  for (const size of [16, 32, 48, 128]) {
    await sharp(size === 16 ? smallLogo : logo).resize(size, size).png().toFile(`${out}/icons/haystack-${size}.png`);
  }
  const files = {};
  async function collect(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await collect(file);
      else files[path.relative(out, file).replaceAll('\\', '/')] = new Uint8Array(await readFile(file));
    }
  }
  await collect(out);
  await writeFile(`artifacts/haystack-${browser}-${version}.zip`, zipSync(files, { level: 9 }));
  console.log(`Built ${browser}: ${Object.keys(files).length} packaged files.`);
}
