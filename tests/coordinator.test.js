import test from 'node:test';
import assert from 'node:assert/strict';
import { SwarmCoordinator } from '../src/coordinator.js';
import { SwarmState } from '../src/state.js';

function createState() {
  let next = 0;
  return new SwarmState({
    idFactory(prefix) {
      next += 1;
      return `${prefix}_${next}`;
    },
    now() {
      return '2026-05-30T04:00:00.000Z';
    }
  });
}

function createFakeOpenCode() {
  const calls = [];
  return {
    baseUrl: 'http://127.0.0.1:4096',
    calls,
    async createSession({ title }) {
      calls.push({ method: 'createSession', title });
      return { id: `session_${title.toLowerCase().replaceAll(' ', '_')}` };
    },
    async sendPromptAsync(input) {
      calls.push({ method: 'sendPromptAsync', input });
      return null;
    }
  };
}

test('createSwarm creates one opencode session per role', async () => {
  const opencode = createFakeOpenCode();
  const coordinator = new SwarmCoordinator({ state: createState(), opencodeClient: opencode });

  const swarm = await coordinator.createSwarm({
    name: 'Checkout hardening',
    projectDir: '/repo',
    roles: [
      { name: 'architect', prompt: 'Plan carefully.' },
      { name: 'coder', model: 'anthropic/claude-sonnet-4-5', prompt: 'Write code.' }
    ]
  });

  assert.deepEqual(
    opencode.calls.filter((call) => call.method === 'createSession').map((call) => call.title),
    ['Checkout hardening / architect', 'Checkout hardening / coder']
  );
  assert.equal(swarm.roles.architect.sessionId, 'session_checkout_hardening_/_architect');
  assert.equal(swarm.roles.coder.status, 'ready');
});

test('assignTask records a task and sends an async prompt to the target role', async () => {
  const opencode = createFakeOpenCode();
  const coordinator = new SwarmCoordinator({ state: createState(), opencodeClient: opencode });
  const swarm = await coordinator.createSwarm({
    name: 'Checkout hardening',
    projectDir: '/repo',
    roles: [{ name: 'coder', model: 'anthropic/claude-sonnet-4-5', prompt: 'Write code.' }]
  });

  const task = await coordinator.assignTask(swarm.id, {
    targetRole: 'coder',
    title: 'Add checkout validation',
    prompt: 'Reject empty carts before payment.'
  });

  const promptCall = opencode.calls.find((call) => call.method === 'sendPromptAsync');
  assert.equal(task.status, 'dispatched');
  assert.equal(promptCall.input.sessionId, 'session_checkout_hardening_/_coder');
  assert.equal(promptCall.input.model, 'anthropic/claude-sonnet-4-5');
  assert.match(promptCall.input.system, /Role: coder/);
  assert.match(promptCall.input.text, /Reject empty carts before payment/);
});

test('reportProgress records MCP callback progress without calling opencode', async () => {
  const opencode = createFakeOpenCode();
  const coordinator = new SwarmCoordinator({ state: createState(), opencodeClient: opencode });
  const swarm = await coordinator.createSwarm({
    name: 'Checkout hardening',
    projectDir: '/repo',
    roles: [{ name: 'coder' }]
  });
  opencode.calls.length = 0;

  const role = coordinator.reportProgress({
    swarmId: swarm.id,
    role: 'coder',
    message: 'Tests are red for the right reason.',
    status: 'working'
  });

  assert.equal(role.status, 'working');
  assert.equal(opencode.calls.length, 0);
  assert.equal(coordinator.getSwarm(swarm.id).events.at(-1).type, 'role.progress');
});

test('sendHandoff records source and target roles in the timeline', async () => {
  const coordinator = new SwarmCoordinator({ state: createState(), opencodeClient: createFakeOpenCode() });
  const swarm = await coordinator.createSwarm({
    name: 'Checkout hardening',
    projectDir: '/repo',
    roles: [{ name: 'coder' }, { name: 'architect' }]
  });

  const role = coordinator.sendHandoff({
    swarmId: swarm.id,
    fromRole: 'coder',
    toRole: 'architect',
    message: 'The patch is ready for review.'
  });

  assert.equal(role.status, 'handoff');
  assert.equal(coordinator.getSwarm(swarm.id).events.at(-1).payload.toRole, 'architect');
});
