import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('dashboard includes operational control regions', async () => {
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');

  for (const id of [
    'connection-state',
    'swarm-form',
    'role-grid',
    'task-form',
    'event-timeline',
    'transcript-panel'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(html, /public\/styles\.css|styles\.css/);
  assert.match(html, /public\/app\.js|app\.js/);
});

test('dashboard stylesheet avoids unstable viewport-scaled type', async () => {
  const css = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.doesNotMatch(css, /font-size:\s*[^;]*vw/);
  assert.match(css, /#role-grid/);
  assert.match(css, /@media/);
});

test('dashboard script calls the coordinator API', async () => {
  const script = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');

  assert.match(script, /\/api\/health/);
  assert.match(script, /\/api\/swarms/);
  assert.match(script, /\/tasks/);
});
