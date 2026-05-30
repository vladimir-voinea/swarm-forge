const TOOL_DEFINITIONS = [
  {
    name: 'swarmforge_report_progress',
    description: 'Report progress from an opencode role session to the SwarmForge coordinator.',
    inputSchema: {
      type: 'object',
      required: ['swarmId', 'role', 'message'],
      properties: {
        swarmId: { type: 'string' },
        role: { type: 'string' },
        message: { type: 'string' },
        status: { type: 'string' },
        taskId: { type: 'string' }
      }
    }
  },
  {
    name: 'swarmforge_send_handoff',
    description: 'Record a role-to-role handoff in the SwarmForge timeline.',
    inputSchema: {
      type: 'object',
      required: ['swarmId', 'fromRole', 'toRole', 'message'],
      properties: {
        swarmId: { type: 'string' },
        fromRole: { type: 'string' },
        toRole: { type: 'string' },
        message: { type: 'string' },
        taskId: { type: 'string' }
      }
    }
  },
  {
    name: 'swarmforge_mark_blocked',
    description: 'Mark a role as blocked with a clear blocking reason.',
    inputSchema: {
      type: 'object',
      required: ['swarmId', 'role', 'message'],
      properties: {
        swarmId: { type: 'string' },
        role: { type: 'string' },
        message: { type: 'string' },
        taskId: { type: 'string' }
      }
    }
  },
  {
    name: 'swarmforge_complete_task',
    description: 'Report that a role has completed its assigned task.',
    inputSchema: {
      type: 'object',
      required: ['swarmId', 'role', 'message'],
      properties: {
        swarmId: { type: 'string' },
        role: { type: 'string' },
        message: { type: 'string' },
        taskId: { type: 'string' }
      }
    }
  }
];

export async function handleMcpRequest({ coordinator, body }) {
  try {
    switch (body.method) {
      case 'initialize':
        return result(body.id, {
          protocolVersion: '2025-03-26',
          capabilities: {
            tools: { listChanged: false }
          },
          serverInfo: {
            name: 'swarmforge',
            version: '0.1.0'
          }
        });

      case 'notifications/initialized':
        return null;

      case 'tools/list':
        return result(body.id, { tools: TOOL_DEFINITIONS });

      case 'tools/call':
        return result(body.id, await callTool({ coordinator, params: body.params ?? {} }));

      default:
        return error(body.id, -32601, `Unknown MCP method: ${body.method}`);
    }
  } catch (caught) {
    return error(
      body.id,
      Number.isInteger(caught?.code) ? caught.code : -32603,
      caught instanceof Error ? caught.message : String(caught)
    );
  }
}

async function callTool({ coordinator, params }) {
  const args = params.arguments ?? {};

  switch (params.name) {
    case 'swarmforge_report_progress': {
      const role = coordinator.reportProgress(args);
      return toolResult(role);
    }

    case 'swarmforge_send_handoff': {
      const role = coordinator.sendHandoff(args);
      return toolResult(role);
    }

    case 'swarmforge_mark_blocked': {
      const role = coordinator.reportProgress({
        ...args,
        status: 'blocked'
      });
      return toolResult(role);
    }

    case 'swarmforge_complete_task': {
      const role = coordinator.reportProgress({
        ...args,
        status: 'complete'
      });
      return toolResult(role);
    }

    default:
      return errorResult(-32601, `Unknown tool: ${params.name}`);
  }
}

function toolResult(payload) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload)
      }
    ]
  };
}

function result(id, value) {
  return {
    jsonrpc: '2.0',
    id,
    result: value
  };
}

function error(id, code, message) {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message }
  };
}

function errorResult(code, message) {
  throw Object.assign(new Error(message), { code });
}
