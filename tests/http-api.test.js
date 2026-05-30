import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHttpServer } from '../src/http-api.js';

async function withServer(coordinator, fn) {
  const server = createHttpServer({ coordinator, publicDir: null });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const body = await response.json();
  return { response, body };
}

test('GET /api/health returns coordinator health', async () => {
  await withServer({ listSwarms: () => [] }, async (baseUrl) => {
    const { response, body } = await requestJson(baseUrl, '/api/health');

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      ok: true,
      service: 'swarmforge-coordinator',
      swarms: 0
    });
  });
});

test('POST /api/swarms creates a swarm through the coordinator', async () => {
  const calls = [];
  const coordinator = {
    async createSwarm(input) {
      calls.push(input);
      return { id: 'swarm_1', name: input.name, roles: {} };
    }
  };

  await withServer(coordinator, async (baseUrl) => {
    const { response, body } = await requestJson(baseUrl, '/api/swarms', {
      method: 'POST',
      body: {
        name: 'Checkout hardening',
        projectDir: '/repo',
        roles: [{ name: 'coder' }]
      }
    });

    assert.equal(response.status, 201);
    assert.deepEqual(calls[0], {
      name: 'Checkout hardening',
      projectDir: '/repo',
      roles: [{ name: 'coder' }]
    });
    assert.equal(body.swarm.id, 'swarm_1');
  });
});

test('GET /api/swarms returns all swarms', async () => {
  const coordinator = {
    listSwarms() {
      return [{ id: 'swarm_1', name: 'Checkout hardening' }];
    }
  };

  await withServer(coordinator, async (baseUrl) => {
    const { response, body } = await requestJson(baseUrl, '/api/swarms');

    assert.equal(response.status, 200);
    assert.deepEqual(body.swarms, [{ id: 'swarm_1', name: 'Checkout hardening' }]);
  });
});

test('POST /api/swarms/:id/tasks dispatches a task', async () => {
  const calls = [];
  const coordinator = {
    async assignTask(swarmId, input) {
      calls.push({ swarmId, input });
      return { id: 'task_1', status: 'dispatched', ...input };
    }
  };

  await withServer(coordinator, async (baseUrl) => {
    const { response, body } = await requestJson(baseUrl, '/api/swarms/swarm_1/tasks', {
      method: 'POST',
      body: {
        targetRole: 'coder',
        title: 'Add validation',
        prompt: 'Reject empty carts.'
      }
    });

    assert.equal(response.status, 201);
    assert.deepEqual(calls[0], {
      swarmId: 'swarm_1',
      input: {
        targetRole: 'coder',
        title: 'Add validation',
        prompt: 'Reject empty carts.'
      }
    });
    assert.equal(body.task.status, 'dispatched');
  });
});

test('API errors are returned as JSON with non-2xx status', async () => {
  const coordinator = {
    listSwarms() {
      throw new Error('state unavailable');
    }
  };

  await withServer(coordinator, async (baseUrl) => {
    const { response, body } = await requestJson(baseUrl, '/api/swarms');

    assert.equal(response.status, 500);
    assert.deepEqual(body, { error: 'state unavailable' });
  });
});
