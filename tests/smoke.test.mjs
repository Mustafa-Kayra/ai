import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { buildProject } from '../scripts/build.mjs';

const rootDir = process.cwd();
const entryFiles = ['index.html', 'index-mobile.html'];
const modularEntryFiles = ['index.modular.html', 'index-mobile.modular.html'];

await run('entry html files exist and no longer reference manifest.json', () => {
  for (const entryFile of entryFiles) {
    const filePath = path.join(rootDir, entryFile);
    assert.ok(existsSync(filePath), `${entryFile} should exist`);
    const html = readFileSync(filePath, 'utf8');
    assert.ok(!html.includes('manifest.json'), `${entryFile} should not reference manifest.json`);
  }
});

await run('entry html files contain hardened preview and markdown helpers', () => {
  for (const entryFile of entryFiles) {
    const html = readFileSync(path.join(rootDir, entryFile), 'utf8');
    assert.match(html, /function sanitizeHtml\(html\)/, `${entryFile} should define sanitizeHtml`);
    assert.match(html, /function renderMarkdownHtml\(content\)/, `${entryFile} should define renderMarkdownHtml`);
    assert.match(html, /<iframe id="canvas-iframe"[^>]*sandbox="allow-scripts allow-downloads"/, `${entryFile} should sandbox the canvas iframe`);
  }
});

await run('build script emits dist entry files', async () => {
  rmSync(path.join(rootDir, 'dist'), { recursive: true, force: true });
  await buildProject();
  for (const entryFile of entryFiles) {
    assert.ok(existsSync(path.join(rootDir, 'dist', entryFile)), `${entryFile} should be copied to dist`);
  }
});

await run('proxy script exists', () => {
  assert.ok(existsSync(path.join(rootDir, 'scripts', 'proxy.mjs')), 'proxy script should exist');
});

await run('modular html files exist and keep original html intact', () => {
  for (const entryFile of modularEntryFiles) {
    const filePath = path.join(rootDir, entryFile);
    assert.ok(existsSync(filePath), `${entryFile} should exist`);
    const html = readFileSync(filePath, 'utf8');
    assert.match(html, /<link rel="stylesheet" href="assets\/css\//, `${entryFile} should reference external css`);
    assert.match(html, /<script src="assets\/js\//, `${entryFile} should reference external js`);
    assert.ok(!/<style>\s*[\s\S]{100,}<\/style>/.test(html), `${entryFile} should not keep the large inline style block`);
  }
  for (const entryFile of entryFiles) {
    assert.ok(existsSync(path.join(rootDir, entryFile)), `${entryFile} should remain in place`);
  }
});

await run('puter build target can expose modular entry as root index.html', async () => {
  const result = await buildProjectForTest('puter');
  assert.ok(existsSync(path.join(rootDir, 'dist-puter', 'index.html')), 'dist-puter/index.html should exist');
  assert.ok(existsSync(path.join(rootDir, 'dist-puter', 'index.legacy.html')), 'dist-puter/index.legacy.html should exist');
  const puterIndex = readFileSync(path.join(rootDir, 'dist-puter', 'index.html'), 'utf8');
  assert.match(puterIndex, /<link rel="stylesheet" href="assets\/css\/index\.modular\.css">/, 'dist-puter index should be modular');
  assert.ok(result.distDir.endsWith('dist-puter'), 'puter build should target dist-puter');
});

await run('deploy console exists with external assets', () => {
  const deployHtmlPath = path.join(rootDir, 'puter-deploy.html');
  assert.ok(existsSync(deployHtmlPath), 'puter-deploy.html should exist');
  const html = readFileSync(deployHtmlPath, 'utf8');
  assert.match(html, /assets\/css\/puter-deploy\.css/, 'deploy console should use external css');
  assert.match(html, /assets\/js\/puter-deploy\.js/, 'deploy console should use external js');
  assert.ok(existsSync(path.join(rootDir, 'assets', 'css', 'puter-deploy.css')), 'deploy css should exist');
  assert.ok(existsSync(path.join(rootDir, 'assets', 'js', 'puter-deploy.js')), 'deploy js should exist');
});

console.log('All smoke checks passed');

async function run(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function buildProjectForTest(target) {
  const originalArgv = process.argv.slice();
  try {
    process.argv = [originalArgv[0], originalArgv[1], '--target', target];
    const modulePath = new URL('../scripts/build.mjs?target=' + target + '&t=' + Date.now(), import.meta.url);
    const imported = await import(modulePath.href);
    return await imported.buildProject();
  } finally {
    process.argv = originalArgv;
  }
}
