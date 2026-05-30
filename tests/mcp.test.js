import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMcpRequest } from '../src/mcp.js';

test('initialize returns MCP server metadata', async () => {
  const response = await handleMcpRequest({
    coordinator: {},
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {}
    }
  });

  assert.equal(response.jsonrpc, '2.0');
  assert.equal(response.id, 1);
  assert.equal(response.result.serverInfo.name, 'swarmforge');
  assert.equal(response.result.capabilities.tools.listChanged, false);
});

test('tools/list exposes SwarmForge callback tools', async () => {
  const response = await handleMcpRequest({
    coordinator: {},
    body: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list'
    }
  });

  assert.deepEqual(
    response.result.tools.map((tool) => tool.name),
    ['swarmforge_report_progress', 'swarmforge_send_handoff', 'swarmforge_mark_blocked', 'swarmforge_complete_task']
  );
});

test('tools/call swarmforge_report_progress records role progress', async () => {
  const calls = [];
  const response = await handleMcpRequest({
    coordinator: {
      reportProgress(input) {
        calls.push(input);
        return { status: 'working' };
      }
    },
    body: {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'swarmforge_report_progress',
        arguments: {
          swarmId: 'swarm_1',
          role: 'coder',
          message: 'Red test is in place.',
          status: 'working'
        }
      }
    }
  });

  assert.deepEqual(calls[0], {
    swarmId: 'swarm_1',
    role: 'coder',
    message: 'Red test is in place.',
    status: 'working'
  });
  assert.equal(response.result.content[0].type, 'text');
  assert.match(response.result.content[0].text, /working/);
});

test('tools/call swarmforge_send_handoff records a handoff', async () => {
  const calls = [];
  const response = await handleMcpRequest({
    coordinator: {
      sendHandoff(input) {
        calls.push(input);
        return { status: 'handoff' };
      }
    },
    body: {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'swarmforge_send_handoff',
        arguments: {
          swarmId: 'swarm_1',
          fromRole: 'coder',
          toRole: 'architect',
          message: 'Ready for review.'
        }
      }
    }
  });

  assert.deepEqual(calls[0], {
    swarmId: 'swarm_1',
    fromRole: 'coder',
    toRole: 'architect',
    message: 'Ready for review.'
  });
  assert.match(response.result.content[0].text, /handoff/);
});

test('unknown MCP tools return JSON-RPC method errors', async () => {
  const response = await handleMcpRequest({
    coordinator: {},
    body: {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'unknown', arguments: {} }
    }
  });

  assert.equal(response.error.code, -32601);
  assert.match(response.error.message, /Unknown tool/);
});
