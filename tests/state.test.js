import test from 'node:test';
import assert from 'node:assert/strict';
import { SwarmState } from '../src/state.js';

function createDeterministicState() {
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

test('createSwarm registers roles with pending sessions', () => {
  const state = createDeterministicState();

  const swarm = state.createSwarm({
    name: 'Checkout hardening',
    projectDir: '/repo',
    roles: [{ name: 'architect' }, { name: 'coder' }]
  });

  assert.equal(swarm.id, 'swarm_1');
  assert.equal(swarm.roles.architect.status, 'pending');
  assert.equal(swarm.roles.coder.status, 'pending');
  assert.equal(swarm.roles.coder.agent, 'build');
  assert.equal(swarm.roles.coder.sessionId, null);
  assert.equal(state.listSwarms().length, 1);
  assert.equal(swarm.events[0].type, 'swarm.created');
});

test('attachSession marks a role ready and stores the opencode session id', () => {
  const state = createDeterministicState();
  const swarm = state.createSwarm({
    name: 'Checkout hardening',
    projectDir: '/repo',
    roles: [{ name: 'coder' }]
  });

  state.attachSession(swarm.id, 'coder', {
    sessionId: 'session_coder',
    opencodeUrl: 'http://127.0.0.1:4096'
  });

  const updated = state.getSwarm(swarm.id);
  assert.equal(updated.roles.coder.status, 'ready');
  assert.equal(updated.roles.coder.sessionId, 'session_coder');
  assert.equal(updated.roles.coder.opencodeUrl, 'http://127.0.0.1:4096');
});

test('addTask records target role and task status', () => {
  const state = createDeterministicState();
  const swarm = state.createSwarm({
    name: 'Checkout hardening',
    projectDir: '/repo',
    roles: [{ name: 'coder' }]
  });

  const task = state.addTask(swarm.id, {
    targetRole: 'coder',
    title: 'Add tests',
    prompt: 'Write the failing checkout test.'
  });

  assert.equal(task.id, 'task_2');
  assert.equal(task.status, 'queued');
  assert.equal(state.getSwarm(swarm.id).tasks[0].targetRole, 'coder');
});

test('recordRoleEvent appends timeline events and updates role status', () => {
  const state = createDeterministicState();
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

test('unknown swarms and roles fail with explicit errors', () => {
  const state = createDeterministicState();
  const swarm = state.createSwarm({
    name: 'Checkout hardening',
    projectDir: '/repo',
    roles: [{ name: 'coder' }]
  });

  assert.throws(() => state.getSwarm('swarm_missing'), /Unknown swarm/);
  assert.throws(() => state.attachSession(swarm.id, 'reviewer', { sessionId: 'x' }), /Unknown role/);
});
