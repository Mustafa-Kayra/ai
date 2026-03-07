import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();

const targets = [
  {
    sourceHtml: 'index.html',
    outputHtml: 'index.modular.html',
    cssFile: 'assets/css/index.modular.css',
    jsFiles: [
      'assets/js/index.bootstrap.js',
      'assets/js/index.app.js',
      'assets/js/index.modules.js'
    ]
  },
  {
    sourceHtml: 'index-mobile.html',
    outputHtml: 'index-mobile.modular.html',
    cssFile: 'assets/css/index-mobile.modular.css',
    jsFiles: [
      'assets/js/index-mobile.bootstrap.js',
      'assets/js/index-mobile.app.js'
    ]
  }
];

for (const target of targets) {
  await splitHtmlFile(target);
}

console.log('Modular HTML files generated successfully');

async function splitHtmlFile(target) {
  const sourcePath = path.join(rootDir, target.sourceHtml);
  const html = await readFile(sourcePath, 'utf8');

  const styleMatch = html.match(/<style>\r?\n?([\s\S]*?)\r?\n?<\/style>/);
  if (!styleMatch) {
    throw new Error(`Style block not found in ${target.sourceHtml}`);
  }

  const inlineScriptMatches = [...html.matchAll(/<script>\r?\n?([\s\S]*?)\r?\n?<\/script>/g)];
  if (inlineScriptMatches.length !== target.jsFiles.length) {
    throw new Error(`Expected ${target.jsFiles.length} inline script blocks in ${target.sourceHtml}, found ${inlineScriptMatches.length}`);
  }

  await writeOutputFile(target.cssFile, styleMatch[1].trimStart());

  for (let i = 0; i < target.jsFiles.length; i++) {
    await writeOutputFile(target.jsFiles[i], inlineScriptMatches[i][1].trimStart());
  }

  let modularHtml = html.replace(styleMatch[0], `  <link rel="stylesheet" href="${target.cssFile.replace(/\\/g, '/')}">`);

  inlineScriptMatches.forEach((match, index) => {
    const scriptTag = match[0];
    const replacement = `  <script src="${target.jsFiles[index].replace(/\\/g, '/')}"></script>`;
    modularHtml = modularHtml.replace(scriptTag, replacement);
  });

  await writeOutputFile(target.outputHtml, modularHtml);
}

async function writeOutputFile(relativePath, content) {
  const filePath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}
