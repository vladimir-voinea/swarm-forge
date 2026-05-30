import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SwarmCoordinator } from './coordinator.js';
import { OpenCodeClient } from './opencode-client.js';
import { createHttpServer } from './http-api.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..');
const publicDir = path.join(repoRoot, 'public');

const port = Number.parseInt(process.env.PORT ?? '7345', 10);
const host = process.env.HOST ?? '127.0.0.1';
const opencodeClient = new OpenCodeClient({
  baseUrl: process.env.OPENCODE_URL ?? 'http://127.0.0.1:4096',
  username: process.env.OPENCODE_USERNAME ?? null,
  password: process.env.OPENCODE_PASSWORD ?? null
});
const coordinator = new SwarmCoordinator({ opencodeClient });
const server = createHttpServer({ coordinator, publicDir });

server.listen(port, host, () => {
  console.log(`SwarmForge coordinator listening on http://${host}:${port}`);
  console.log(`OpenCode backend: ${opencodeClient.baseUrl}`);
});
