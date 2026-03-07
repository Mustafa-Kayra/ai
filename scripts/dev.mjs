import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const args = process.argv.slice(2);
const rootIndex = args.indexOf('--root');
const portIndex = args.indexOf('--port');

const rootDir = path.resolve(process.cwd(), rootIndex >= 0 ? args[rootIndex + 1] : '.');
const port = Number(portIndex >= 0 ? args[portIndex + 1] : process.env.PORT || 3000);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const server = http.createServer(async (req, res) => {
  try {
    const requestedPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const safePath = normalizeRequestPath(requestedPath);
    let filePath = path.join(rootDir, safePath);

    const fileInfo = await resolveServedPath(filePath);
    filePath = fileInfo.path;

    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    const statusCode = error?.code === 'ENOENT' ? 404 : 500;
    res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(statusCode === 404 ? 'Not Found' : `Server Error: ${error.message}`);
  }
});

server.listen(port, () => {
  console.log(`Serving ${rootDir} at http://localhost:${port}`);
});

function normalizeRequestPath(requestPath) {
  const withDefault = requestPath === '/' ? '/index.html' : requestPath;
  const normalized = path.posix.normalize(withDefault);
  if (normalized.startsWith('../')) {
    throw Object.assign(new Error('Path traversal is not allowed'), { code: 'ENOENT' });
  }
  return normalized.replace(/^\/+/, '');
}

async function resolveServedPath(initialPath) {
  const initialInfo = await safeStat(initialPath);
  if (initialInfo?.isFile()) return { path: initialPath };
  if (initialInfo?.isDirectory()) {
    const indexPath = path.join(initialPath, 'index.html');
    await access(indexPath);
    return { path: indexPath };
  }

  const htmlFallback = `${initialPath}.html`;
  await access(htmlFallback);
  return { path: htmlFallback };
}

async function safeStat(targetPath) {
  try {
    return await stat(targetPath);
  } catch {
    return null;
  }
}
