import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { WebSocketServer } from 'ws';

const port = Number(process.env.PORT || 8787);
const upstreamBaseUrl = (process.env.PROXY_UPSTREAM_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const upstreamApiKey = process.env.PROXY_UPSTREAM_API_KEY || process.env.OPENAI_API_KEY || '';
const defaultModel = process.env.PROXY_DEFAULT_MODEL || 'gpt-4o-mini';
const terminalRootDir = path.join(os.tmpdir(), 'ai-project-terminal');
const sessions = new Map();

await mkdir(terminalRootDir, { recursive: true });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, {
        ok: true,
        upstreamBaseUrl,
        defaultModel,
        llmProxyReady: !!upstreamApiKey,
        terminalReady: true
      });
    }

    if (req.method === 'GET' && url.pathname === '/terminal/health') {
      return sendJson(res, 200, {
        ok: true,
        terminalReady: true,
        sessions: sessions.size,
        shell: getShellConfig().command
      });
    }

    if (req.method === 'GET' && url.pathname === '/v1/models') {
      return sendJson(res, 200, { data: [{ id: defaultModel, object: 'model' }] });
    }

    if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
      if (!upstreamApiKey) {
        return sendJson(res, 500, {
          error: 'Missing PROXY_UPSTREAM_API_KEY or OPENAI_API_KEY'
        });
      }

      const body = await readJson(req);
      const payload = {
        ...body,
        model: body.model || defaultModel,
        stream: false
      };
      const upstreamResponse = await fetch(`${upstreamBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${upstreamApiKey}`
        },
        body: JSON.stringify(payload)
      });
      const raw = await upstreamResponse.text();
      res.writeHead(upstreamResponse.status, { 'Content-Type': upstreamResponse.headers.get('content-type') || 'application/json; charset=utf-8' });
      res.end(raw);
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  if (url.pathname !== '/terminal/socket') {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, ws => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', ws => {
  const session = {
    id: randomUUID(),
    ws,
    shell: null,
    workdir: '',
    fileNames: new Set()
  };
  sessions.set(session.id, session);
  sendWs(session, { type: 'hello', sessionId: session.id });

  ws.on('message', async raw => {
    try {
      const message = JSON.parse(String(raw || '{}'));
      if (message.type === 'init') {
        await initializeTerminalSession(session, message);
      } else if (message.type === 'sync-files') {
        await syncWorkspace(session, message.files || {});
        sendWs(session, { type: 'synced', fileCount: session.fileNames.size });
      } else if (message.type === 'input') {
        if (session.shell && !session.shell.killed) {
          session.shell.stdin.write(String(message.data || ''));
        }
      } else if (message.type === 'terminate') {
        cleanupSession(session.id);
      }
    } catch (error) {
      sendWs(session, { type: 'error', message: error.message });
    }
  });

  ws.on('close', () => cleanupSession(session.id));
  ws.on('error', () => cleanupSession(session.id));
});

server.listen(port, () => {
  console.log(`Proxy listening on http://localhost:${port}`);
  console.log(`LLM upstream: ${upstreamBaseUrl}`);
  console.log(`LLM proxy ready: ${upstreamApiKey ? 'yes' : 'no'}`);
  console.log(`Terminal bridge ready: ws://localhost:${port}/terminal/socket`);
});

async function initializeTerminalSession(session, message) {
  if (!session.workdir) {
    session.workdir = path.join(terminalRootDir, session.id);
    await mkdir(session.workdir, { recursive: true });
  }

  await syncWorkspace(session, message.files || {});
  if (session.shell && !session.shell.killed) {
    sendWs(session, { type: 'ready', cwd: session.workdir, shell: getShellConfig().command });
    return;
  }

  const shellConfig = getShellConfig();
  const child = spawn(shellConfig.command, shellConfig.args, {
    cwd: session.workdir,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1'
    },
    stdio: 'pipe'
  });

  session.shell = child;

  child.stdout.on('data', chunk => sendWs(session, { type: 'output', data: chunk.toString('utf8') }));
  child.stderr.on('data', chunk => sendWs(session, { type: 'output', data: chunk.toString('utf8') }));
  child.on('exit', code => {
    sendWs(session, { type: 'exit', code: code ?? 0 });
    cleanupSession(session.id);
  });
  child.on('error', error => {
    sendWs(session, { type: 'error', message: error.message });
    cleanupSession(session.id);
  });

  sendWs(session, { type: 'ready', cwd: session.workdir, shell: shellConfig.command });
}

function getShellConfig() {
  if (process.platform === 'win32') {
    const preferred = process.env.COMSPEC && process.env.COMSPEC.toLowerCase().includes('cmd.exe')
      ? 'powershell.exe'
      : 'powershell.exe';
    return {
      command: preferred,
      args: ['-NoLogo', '-NoProfile']
    };
  }

  return {
    command: process.env.SHELL || '/bin/bash',
    args: ['-i']
  };
}

async function syncWorkspace(session, files) {
  if (!session.workdir) {
    session.workdir = path.join(terminalRootDir, session.id);
    await mkdir(session.workdir, { recursive: true });
  }

  const normalizedFiles = normalizeFiles(files);
  const nextFiles = new Set(Object.keys(normalizedFiles));

  for (const existing of session.fileNames) {
    if (nextFiles.has(existing)) continue;
    const target = path.join(session.workdir, existing);
    await safeRemoveFile(target);
  }

  for (const [relativePath, content] of Object.entries(normalizedFiles)) {
    const target = path.join(session.workdir, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, String(content), 'utf8');
  }

  session.fileNames = nextFiles;
}

function normalizeFiles(files) {
  const result = {};
  for (const [rawPath, rawContent] of Object.entries(files || {})) {
    const normalized = normalizeRelativePath(rawPath);
    if (!normalized) continue;
    result[normalized] = String(rawContent ?? '');
  }
  return result;
}

function normalizeRelativePath(rawPath) {
  const normalized = path.posix.normalize(String(rawPath || '').replace(/\\/g, '/')).replace(/^\/+/, '');
  if (!normalized || normalized.startsWith('../')) return '';
  return normalized;
}

async function safeRemoveFile(targetPath) {
  try {
    const info = await stat(targetPath);
    if (info.isDirectory()) {
      await rm(targetPath, { recursive: true, force: true });
    } else {
      await unlink(targetPath);
    }
    await pruneEmptyParents(path.dirname(targetPath));
  } catch {
    return;
  }
}

async function pruneEmptyParents(dir) {
  const root = path.resolve(terminalRootDir);
  let current = path.resolve(dir);
  while (current.startsWith(root) && current !== root) {
    try {
      const entries = await readdir(current);
      if (entries.length > 0) break;
      await rm(current, { recursive: true, force: true });
      current = path.dirname(current);
    } catch {
      break;
    }
  }
}

function cleanupSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  sessions.delete(sessionId);
  try {
    if (session.shell && !session.shell.killed) session.shell.kill();
  } catch {
    // ignore
  }
  if (session.workdir) {
    rm(session.workdir, { recursive: true, force: true }).catch(() => {});
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data, null, 2));
}

function sendWs(session, payload) {
  if (!session.ws || session.ws.readyState !== session.ws.OPEN) return;
  session.ws.send(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}
