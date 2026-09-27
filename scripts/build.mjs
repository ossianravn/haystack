import { build as viteBuild } from 'vite';
import { build as esbuild } from 'esbuild';
import { cp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { zipSync } from 'fflate';
import { manifest } from './manifest.mjs';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
await viteBuild();
const logo = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="20" fill="#d3b66f"/><g fill="none" stroke="#342c20" stroke-width="9" stroke-linecap="square"><path d="m29 85 23-47m-1 53 23-62m4 59 20-43"/><path d="M29 107h70" stroke-width="7"/></g></svg>';
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
    await sharp(Buffer.from(logo)).resize(size, size).png().toFile(`${out}/icons/haystack-${size}.png`);
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
