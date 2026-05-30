import { SwarmState } from './state.js';
import { OpenCodeClient } from './opencode-client.js';

export const DEFAULT_ROLES = [
  {
    name: 'architect',
    prompt: 'Plan work, clarify acceptance criteria, and review architecture before implementation.'
  },
  {
    name: 'coder',
    prompt: 'Implement focused changes with tests and report progress through SwarmForge.'
  },
  {
    name: 'reviewer',
    prompt: 'Review behavior, tests, and risks before work is considered complete.'
  }
];

export class SwarmCoordinator {
  #state;
  #opencodeClient;

  constructor({ state = new SwarmState(), opencodeClient = new OpenCodeClient() } = {}) {
    this.#state = state;
    this.#opencodeClient = opencodeClient;
  }

  async createSwarm({ name, projectDir, roles = DEFAULT_ROLES }) {
    const swarm = this.#state.createSwarm({ name, projectDir, roles });

    for (const role of Object.values(swarm.roles)) {
      const session = await this.#opencodeClient.createSession({
        title: `${name} / ${role.name}`
      });
      this.#state.attachSession(swarm.id, role.name, {
        sessionId: session.id,
        opencodeUrl: this.#opencodeClient.baseUrl
      });
    }

    return this.#state.getSwarm(swarm.id);
  }

  async assignTask(swarmId, { targetRole, title, prompt }) {
    const task = this.#state.addTask(swarmId, { targetRole, title, prompt });
    const swarm = this.#state.getSwarm(swarmId);
    const role = swarm.roles[targetRole];

    if (!role.sessionId) {
      throw new Error(`Role ${targetRole} does not have an opencode session`);
    }

    await this.#opencodeClient.sendPromptAsync({
      sessionId: role.sessionId,
      agent: role.agent,
      model: role.model,
      system: this.#buildSystemPrompt({ swarm, role }),
      text: this.#buildTaskPrompt({ task, prompt })
    });

    const dispatched = this.#state.updateTask(swarmId, task.id, { status: 'dispatched' });
    this.#state.recordRoleEvent(swarmId, targetRole, {
      type: 'task.dispatched',
      taskId: task.id,
      status: 'working',
      message: `Dispatched task: ${title}`
    });

    return dispatched;
  }

  reportProgress({ swarmId, role, message, status = 'working', taskId = null }) {
    return this.#state.recordRoleEvent(swarmId, role, {
      type: 'role.progress',
      taskId,
      status,
      message
    });
  }

  sendHandoff({ swarmId, fromRole, toRole, message, taskId = null }) {
    return this.#state.recordRoleEvent(swarmId, fromRole, {
      type: 'role.handoff',
      taskId,
      status: 'handoff',
      message,
      payload: { toRole }
    });
  }

  listSwarms() {
    return this.#state.listSwarms();
  }

  getSwarm(swarmId) {
    return this.#state.getSwarm(swarmId);
  }

  #buildSystemPrompt({ swarm, role }) {
    return [
      'You are running as a SwarmForge role inside an opencode session.',
      `Swarm: ${swarm.name}`,
      `Project directory: ${swarm.projectDir}`,
      `Role: ${role.name}`,
      `Role instructions: ${role.prompt || 'Follow the task prompt and report progress through SwarmForge MCP tools.'}`,
      'Use the SwarmForge MCP tools for progress updates, handoffs, blocked status, and completion.'
    ].join('\n');
  }

  #buildTaskPrompt({ task, prompt }) {
    return [
      `Task: ${task.title}`,
      '',
      prompt,
      '',
      'Report meaningful progress with swarmforge_report_progress before handing work off.'
    ].join('\n');
  }
}
