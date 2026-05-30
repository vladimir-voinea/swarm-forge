import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenCodeClient } from '../src/opencode-client.js';

function createFetchRecorder(responses) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const response = responses.shift() ?? { status: 200, body: {} };
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.statusText ?? 'OK',
      async text() {
        if (response.body === undefined || response.body === null) {
          return '';
        }
        return typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
      }
    };
  };

  return { calls, fetchImpl };
}

test('createSession posts a session title to opencode', async () => {
  const { calls, fetchImpl } = createFetchRecorder([
    { status: 200, body: { id: 'ses_123', title: 'Coder' } }
  ]);
  const client = new OpenCodeClient({ baseUrl: 'http://127.0.0.1:4096/', fetchImpl });

  const session = await client.createSession({ title: 'Coder' });

  assert.deepEqual(session, { id: 'ses_123', title: 'Coder' });
  assert.equal(calls[0].url, 'http://127.0.0.1:4096/session');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), { title: 'Coder' });
});

test('sendPromptAsync posts an opencode prompt_async message', async () => {
  const { calls, fetchImpl } = createFetchRecorder([{ status: 204, body: null }]);
  const client = new OpenCodeClient({ baseUrl: 'http://127.0.0.1:4096', fetchImpl });

  const result = await client.sendPromptAsync({
    sessionId: 'ses_123',
    agent: 'build',
    model: 'anthropic/claude-sonnet-4-5',
    system: 'You are the coder.',
    text: 'Implement checkout validation.'
  });

  assert.equal(result, null);
  assert.equal(calls[0].url, 'http://127.0.0.1:4096/session/ses_123/prompt_async');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    agent: 'build',
    model: {
      providerID: 'anthropic',
      modelID: 'claude-sonnet-4-5'
    },
    system: 'You are the coder.',
    parts: [{ type: 'text', text: 'Implement checkout validation.' }]
  });
});

test('sendPromptAsync splits DeepSeek provider model strings for the opencode API', async () => {
  const { calls, fetchImpl } = createFetchRecorder([{ status: 204, body: null }]);
  const client = new OpenCodeClient({ baseUrl: 'http://127.0.0.1:4096', fetchImpl });

  await client.sendPromptAsync({
    sessionId: 'ses_123',
    agent: 'build',
    model: 'deepseek/deepseek-v4-flash',
    text: 'Say hello.'
  });

  assert.deepEqual(JSON.parse(calls[0].options.body).model, {
    providerID: 'deepseek',
    modelID: 'deepseek-v4-flash'
  });
});

test('getSessionStatus reads opencode session status', async () => {
  const { calls, fetchImpl } = createFetchRecorder([
    { status: 200, body: { ses_123: { status: 'idle' } } }
  ]);
  const client = new OpenCodeClient({ baseUrl: 'http://127.0.0.1:4096', fetchImpl });

  const status = await client.getSessionStatus();

  assert.deepEqual(status, { ses_123: { status: 'idle' } });
  assert.equal(calls[0].url, 'http://127.0.0.1:4096/session/status');
  assert.equal(calls[0].options.method, 'GET');
});

test('requests include basic auth when credentials are provided', async () => {
  const { calls, fetchImpl } = createFetchRecorder([{ status: 200, body: { healthy: true } }]);
  const client = new OpenCodeClient({
    baseUrl: 'http://127.0.0.1:4096',
    username: 'opencode',
    password: 'secret',
    fetchImpl
  });

  await client.health();

  assert.equal(calls[0].options.headers.authorization, `Basic ${Buffer.from('opencode:secret').toString('base64')}`);
});

test('non-ok opencode responses throw useful errors', async () => {
  const { fetchImpl } = createFetchRecorder([{ status: 500, statusText: 'Server Error', body: 'boom' }]);
  const client = new OpenCodeClient({ baseUrl: 'http://127.0.0.1:4096', fetchImpl });

  await assert.rejects(
    () => client.health(),
    /OpenCode request failed: GET \/global\/health returned 500 Server Error: boom/
  );
});
