import http from 'node:http';

const port = Number(process.env.PORT || 8787);
const upstreamBaseUrl = (process.env.PROXY_UPSTREAM_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const upstreamApiKey = process.env.PROXY_UPSTREAM_API_KEY || process.env.OPENAI_API_KEY || '';
const defaultModel = process.env.PROXY_DEFAULT_MODEL || 'gpt-4o-mini';

if (!upstreamApiKey) {
  console.error('Missing PROXY_UPSTREAM_API_KEY or OPENAI_API_KEY');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true, upstreamBaseUrl, defaultModel });
    }

    if (req.method === 'GET' && url.pathname === '/v1/models') {
      return sendJson(res, 200, { data: [{ id: defaultModel, object: 'model' }] });
    }

    if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
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

server.listen(port, () => {
  console.log(`Proxy listening on http://localhost:${port}`);
  console.log(`Upstream: ${upstreamBaseUrl}`);
});

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data, null, 2));
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
