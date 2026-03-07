import { mkdir, readdir, readFile, rm, stat, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();
const args = process.argv.slice(2);
const targetName = args.includes('--target') ? args[args.indexOf('--target') + 1] : 'default';
const distDir = path.join(rootDir, targetName === 'puter' ? 'dist-puter' : 'dist');
const candidateEntryFiles = ['index.html', 'index-mobile.html', 'index.modular.html', 'index-mobile.modular.html', 'puter-deploy.html'];
const staticDirs = ['assets', 'public', 'static', 'images', 'img', 'fonts'];
const copiedPaths = new Set();

const localRefPattern = /(?:src|href)=["'](?!https?:|\/\/|data:|mailto:|tel:|#)([^"'?]+(?:\?[^"']*)?)["']/gi;

export async function buildProject() {
  copiedPaths.clear();
  const entryFiles = [];

  for (const file of candidateEntryFiles) {
    const fileInfo = await safeStat(path.join(rootDir, file));
    if (fileInfo?.isFile()) entryFiles.push(file);
  }

  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  for (const entryFile of entryFiles) {
    const sourcePath = path.join(rootDir, entryFile);
    const fileInfo = await safeStat(sourcePath);
    if (!fileInfo?.isFile()) {
      throw new Error(`Missing entry file: ${entryFile}`);
    }

    const html = await readFile(sourcePath, 'utf8');
    await copyIntoDist(sourcePath, entryFile);

    for (const ref of collectLocalRefs(html)) {
      const normalizedRef = normalizeRelativeRef(ref);
      if (!normalizedRef) continue;
      const assetSourcePath = path.join(rootDir, normalizedRef);
      const assetInfo = await safeStat(assetSourcePath);
      if (!assetInfo) continue;

      if (assetInfo.isDirectory()) {
        await copyDirectory(assetSourcePath, path.join(distDir, normalizedRef));
        copiedPaths.add(normalizedRef);
      } else if (assetInfo.isFile()) {
        await copyIntoDist(assetSourcePath, normalizedRef);
      }
    }
  }

  for (const staticDir of staticDirs) {
    if (copiedPaths.has(staticDir)) continue;
    const sourcePath = path.join(rootDir, staticDir);
    const info = await safeStat(sourcePath);
    if (info?.isDirectory()) {
      await copyDirectory(sourcePath, path.join(distDir, staticDir));
    }
  }

  const copiedFiles = await listFiles(distDir);
  if (targetName === 'puter') {
    await preparePuterOutput(distDir);
  }
  await writeDeployManifest(distDir);
  return {
    copiedFiles: await listFiles(distDir),
    distDir
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { copiedFiles } = await buildProject();
  console.log(`Built ${copiedFiles.length} file(s) into ${path.relative(rootDir, distDir)}`);
}

function collectLocalRefs(html) {
  const refs = new Set();
  let match;
  while ((match = localRefPattern.exec(html)) !== null) {
    refs.add(match[1]);
  }
  return [...refs];
}

function normalizeRelativeRef(ref) {
  const cleanRef = String(ref || '').split('#')[0].split('?')[0].trim();
  if (!cleanRef || cleanRef.startsWith('/')) return null;
  const normalized = path.normalize(cleanRef).replace(/\\/g, '/');
  if (normalized.startsWith('../')) return null;
  return normalized;
}

async function safeStat(targetPath) {
  try {
    return await stat(targetPath);
  } catch {
    return null;
  }
}

async function copyIntoDist(sourcePath, relativeTargetPath) {
  const targetPath = path.join(distDir, relativeTargetPath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
  copiedPaths.add(relativeTargetPath.replace(/\\/g, '/'));
}

async function copyDirectory(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      await mkdir(path.dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);
    }
  }
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      output.push(...await listFiles(entryPath));
    } else if (entry.isFile()) {
      output.push(entryPath);
    }
  }
  return output;
}

async function preparePuterOutput(targetDir) {
  const modularIndex = path.join(targetDir, 'index.modular.html');
  const modularMobile = path.join(targetDir, 'index-mobile.modular.html');
  const legacyIndex = path.join(targetDir, 'index.html');
  const legacyMobile = path.join(targetDir, 'index-mobile.html');

  if (await safeStat(modularIndex)) {
    await copyFile(legacyIndex, path.join(targetDir, 'index.legacy.html'));
    await copyFile(modularIndex, legacyIndex);
  }

  if (await safeStat(modularMobile)) {
    await copyFile(legacyMobile, path.join(targetDir, 'index-mobile.legacy.html'));
    await copyFile(modularMobile, legacyMobile);
  }
}

async function writeDeployManifest(targetDir) {
  const files = (await listFiles(targetDir))
    .map(file => path.relative(targetDir, file).replace(/\\/g, '/'))
    .filter(file => file !== 'deploy-manifest.json');
  const manifest = {
    generatedAt: new Date().toISOString(),
    target: path.basename(targetDir),
    files
  };
  await writeFile(path.join(targetDir, 'deploy-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
}
