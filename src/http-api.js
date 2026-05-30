import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { handleMcpRequest } from './mcp.js';

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml']
]);

export function createHttpServer({ coordinator, publicDir }) {
  return http.createServer(async (request, response) => {
    try {
      await routeRequest({ request, response, coordinator, publicDir });
    } catch (caught) {
      writeJson(response, statusForError(caught), {
        error: caught instanceof Error ? caught.message : String(caught)
      });
    }
  });
}

async function routeRequest({ request, response, coordinator, publicDir }) {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');

  if (request.method === 'OPTIONS') {
    writeHeaders(response, 204, { 'access-control-allow-methods': 'GET,POST,OPTIONS' });
    response.end();
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/health') {
    writeJson(response, 200, {
      ok: true,
      service: 'swarmforge-coordinator',
      swarms: coordinator.listSwarms().length
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/swarms') {
    writeJson(response, 200, { swarms: coordinator.listSwarms() });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/swarms') {
    const body = await readJson(request);
    const swarm = await coordinator.createSwarm(body);
    writeJson(response, 201, { swarm });
    return;
  }

  const swarmTaskMatch = url.pathname.match(/^\/api\/swarms\/([^/]+)\/tasks$/);
  if (request.method === 'POST' && swarmTaskMatch) {
    const body = await readJson(request);
    const task = await coordinator.assignTask(decodeURIComponent(swarmTaskMatch[1]), body);
    writeJson(response, 201, { task });
    return;
  }

  const swarmMatch = url.pathname.match(/^\/api\/swarms\/([^/]+)$/);
  if (request.method === 'GET' && swarmMatch) {
    const swarm = coordinator.getSwarm(decodeURIComponent(swarmMatch[1]));
    writeJson(response, 200, { swarm });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/events') {
    writeSse(response, coordinator);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/mcp') {
    const body = await readJson(request);
    const rpcResponse = await handleMcpRequest({ coordinator, body });
    if (rpcResponse === null) {
      writeHeaders(response, 202, {});
      response.end();
    } else {
      writeJson(response, 200, rpcResponse);
    }
    return;
  }

  if (request.method === 'GET' && publicDir) {
    await serveStatic({ response, publicDir, pathname: url.pathname });
    return;
  }

  writeJson(response, 404, { error: 'Not found' });
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text.length === 0 ? {} : JSON.parse(text);
}

function writeJson(response, status, body) {
  writeHeaders(response, status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function writeHeaders(response, status, headers) {
  response.writeHead(status, {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization, mcp-session-id',
    ...headers
  });
}

function writeSse(response, coordinator) {
  writeHeaders(response, 200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive'
  });
  response.write(`event: snapshot\ndata: ${JSON.stringify({ swarms: coordinator.listSwarms() })}\n\n`);
  const interval = setInterval(() => {
    response.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  }, 15000);
  response.on('close', () => clearInterval(interval));
}

async function serveStatic({ response, publicDir, pathname }) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const resolvedPath = path.resolve(publicDir, relativePath);
  const publicRoot = path.resolve(publicDir);

  if (!resolvedPath.startsWith(`${publicRoot}${path.sep}`) && resolvedPath !== publicRoot) {
    writeJson(response, 403, { error: 'Forbidden' });
    return;
  }

  try {
    const data = await fs.readFile(resolvedPath);
    writeHeaders(response, 200, {
      'content-type': MIME_TYPES.get(path.extname(resolvedPath)) ?? 'application/octet-stream'
    });
    response.end(data);
  } catch (caught) {
    if (path.extname(resolvedPath) === '') {
      await serveStatic({ response, publicDir, pathname: '/' });
      return;
    }
    writeJson(response, 404, { error: 'Not found' });
  }
}

function statusForError(error) {
  if (error instanceof SyntaxError) {
    return 400;
  }
  if (error instanceof Error && error.message.startsWith('Unknown')) {
    return 404;
  }
  return 500;
}
