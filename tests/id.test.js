import test from 'node:test';
import assert from 'node:assert/strict';
import { createId } from '../src/id.js';

test('createId returns lowercase ids with the requested prefix', () => {
  const id = createId('swarm');
  assert.match(id, /^swarm_[a-z0-9]+$/);
});
