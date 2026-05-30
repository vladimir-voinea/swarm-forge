# OpenCode Coordinator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a SwarmForge coordinator service that drives multiple opencode HTTP sessions, exposes a browser control interface, and provides an MCP callback endpoint for agents.

**Architecture:** Add a Node.js service beside the existing shell runtime. The service owns in-memory swarm state, talks to `opencode serve` through an adapter, exposes REST/SSE APIs plus a minimal MCP-over-HTTP endpoint, and serves a static dashboard from `public/`.

**Tech Stack:** Node.js 26 ESM, built-in `node:test`, built-in HTTP server, built-in `fetch`, static HTML/CSS/JS, no runtime npm dependencies for the MVP.

---

### Task 1: Project Harness

**Files:**
- Create: `package.json`
- Create: `src/id.js`
- Create: `tests/id.test.js`
- Modify: `tests/run-all.zsh`

- [ ] **Step 1: Write the failing test**

Create `tests/id.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createId } from '../src/id.js';

test('createId returns lowercase ids with the requested prefix', () => {
  const id = createId('swarm');
  assert.match(id, /^swarm_[a-z0-9]+$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/id.test.js`
Expected: FAIL with `Cannot find module` for `src/id.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/id.js`:

```js
import { randomUUID } from 'node:crypto';

export function createId(prefix) {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}
```

Create `package.json`:

```json
{
  "name": "swarm-forge",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "test": "zsh tests/run-all.zsh"
  },
  "engines": {
    "node": ">=26"
  }
}
```

Create `tests/run-all.zsh` to run shell tests and Node tests:

```zsh
#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

for test_file in "$ROOT_DIR"/tests/*.zsh; do
  [[ "${test_file:t}" == "run-all.zsh" ]] && continue
  zsh "$test_file"
done

node --test "$ROOT_DIR"/tests/*.test.js
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/id.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add package.json src/id.js tests/id.test.js tests/run-all.zsh
git commit -m "test: add node test harness for coordinator work"
```

### Task 2: Coordinator State Core

**Files:**
- Create: `src/state.js`
- Create: `tests/state.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/state.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { SwarmState } from '../src/state.js';

test('createSwarm registers roles with pending sessions', () => {
  const state = new SwarmState({ idFactory: (prefix) => `${prefix}_1` });
  const swarm = state.createSwarm({
    name: 'Checkout hardening',
    projectDir: '/repo',
    roles: [{ name: 'architect' }, { name: 'coder' }]
  });

  assert.equal(swarm.id, 'swarm_1');
  assert.equal(swarm.roles.architect.status, 'pending');
  assert.equal(swarm.roles.coder.status, 'pending');
  assert.equal(state.listSwarms().length, 1);
});

test('recordRoleEvent appends timeline events and updates role status', () => {
  const state = new SwarmState({ idFactory: (prefix) => `${prefix}_1` });
  const swarm = state.createSwarm({
    name: 'Checkout hardening',
    projectDir: '/repo',
    roles: [{ name: 'coder' }]
  });

  state.recordRoleEvent(swarm.id, 'coder', {
    type: 'progress',
    message: 'Implemented failing test',
    status: 'working'
  });

  const updated = state.getSwarm(swarm.id);
  assert.equal(updated.roles.coder.status, 'working');
  assert.equal(updated.events[1].message, 'Implemented failing test');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/state.test.js`
Expected: FAIL with `Cannot find module` for `src/state.js`.

- [ ] **Step 3: Implement state**

Create `src/state.js` with `SwarmState` methods: `createSwarm`, `listSwarms`, `getSwarm`, `attachSession`, `addTask`, `recordRoleEvent`, and `toJSON`. Store state in memory using `Map`.

- [ ] **Step 4: Run tests**

Run: `node --test tests/state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/state.js tests/state.test.js
git commit -m "feat: add in-memory coordinator state model"
```

### Task 3: OpenCode HTTP Adapter

**Files:**
- Create: `src/opencode-client.js`
- Create: `tests/opencode-client.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/opencode-client.test.js` to inject a fake `fetch` and verify:
- `createSession({ title })` posts to `/session`
- `sendPromptAsync({ sessionId, agent, model, system, text })` posts to `/session/:id/prompt_async`
- `getSessionStatus()` gets `/session/status`

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/opencode-client.test.js`
Expected: FAIL with `Cannot find module` for `src/opencode-client.js`.

- [ ] **Step 3: Implement adapter**

Create `OpenCodeClient` with constructor `{ baseUrl, username, password, fetchImpl }`, JSON request handling, optional basic auth, and typed methods for the endpoints above.

- [ ] **Step 4: Run tests**

Run: `node --test tests/opencode-client.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/opencode-client.js tests/opencode-client.test.js
git commit -m "feat: add opencode HTTP client adapter"
```

### Task 4: Coordinator Service

**Files:**
- Create: `src/coordinator.js`
- Create: `tests/coordinator.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/coordinator.test.js` to verify:
- `createSwarm` creates one opencode session per role and stores returned session IDs
- `assignTask` records a task and sends an async prompt to the chosen role
- `reportProgress` records MCP callback progress without calling opencode

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/coordinator.test.js`
Expected: FAIL with `Cannot find module` for `src/coordinator.js`.

- [ ] **Step 3: Implement service**

Create `SwarmCoordinator` with `createSwarm`, `assignTask`, `reportProgress`, `sendHandoff`, `listSwarms`, and `getSwarm`. Keep prompts deterministic and compact.

- [ ] **Step 4: Run tests**

Run: `node --test tests/coordinator.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/coordinator.js tests/coordinator.test.js
git commit -m "feat: coordinate role sessions through opencode"
```

### Task 5: HTTP API and MCP Endpoint

**Files:**
- Create: `src/http-api.js`
- Create: `src/mcp.js`
- Create: `src/server.js`
- Create: `tests/http-api.test.js`
- Create: `tests/mcp.test.js`

- [ ] **Step 1: Write failing tests**

Create API tests for:
- `GET /api/health`
- `POST /api/swarms`
- `GET /api/swarms`
- `POST /api/swarms/:id/tasks`

Create MCP tests for JSON-RPC methods:
- `initialize`
- `tools/list`
- `tools/call` with `swarmforge_report_progress`
- `tools/call` with `swarmforge_send_handoff`

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/http-api.test.js tests/mcp.test.js`
Expected: FAIL with missing modules.

- [ ] **Step 3: Implement HTTP and MCP**

Implement a dependency-injected `createHttpServer({ coordinator, publicDir })`, a `handleMcpRequest({ coordinator, body })`, and `src/server.js` for CLI startup. Use JSON responses, status codes, and SSE at `/api/events`.

- [ ] **Step 4: Run tests**

Run: `node --test tests/http-api.test.js tests/mcp.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/http-api.js src/mcp.js src/server.js tests/http-api.test.js tests/mcp.test.js
git commit -m "feat: expose coordinator HTTP API and MCP callbacks"
```

### Task 6: Browser Control UI

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`
- Create: `tests/ui.test.js`

- [ ] **Step 1: Write failing UI structure test**

Create `tests/ui.test.js` to assert `public/index.html` includes containers for role status, task composer, event timeline, and opencode connection state.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ui.test.js`
Expected: FAIL because files do not exist.

- [ ] **Step 3: Implement UI**

Build the actual dashboard as the first screen: header status bar, swarm creation form, role grid, task composer, event timeline, and transcript panel. Use responsive CSS with stable dimensions and no marketing hero.

- [ ] **Step 4: Run test**

Run: `node --test tests/ui.test.js`
Expected: PASS.

- [ ] **Step 5: Browser verification**

Run `npm start`, open `http://127.0.0.1:7345`, create a swarm against a mock/unavailable opencode URL, verify the UI renders cleanly and errors are visible without layout overlap.

- [ ] **Step 6: Commit**

Run:

```bash
git add public/index.html public/styles.css public/app.js tests/ui.test.js
git commit -m "feat: add browser control dashboard"
```

### Task 7: Documentation and Existing Test Repair

**Files:**
- Modify: `README.md`
- Modify: stale shell tests if they assert removed or outdated text

- [ ] **Step 1: Write/update documentation checks**

Add or update shell assertions for coordinator docs only where they reflect current behavior.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

Run:

```bash
git add README.md tests
git commit -m "docs: document the opencode coordinator workflow"
```

### Task 8: Final Verification

**Files:**
- No planned file edits.

- [ ] **Step 1: Run full tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 2: Start server**

Run: `PORT=7345 npm start`
Expected: server prints the local URL.

- [ ] **Step 3: Browser smoke test**

Open `http://127.0.0.1:7345`, verify the dashboard loads, create swarm form is usable, and viewport checks show no overlapping text at desktop and mobile widths.

- [ ] **Step 4: Push branch**

Run:

```bash
git push -u origin feature/opencode-coordinator
```
