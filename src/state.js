import { createId } from './id.js';

function snapshot(value) {
  return structuredClone(value);
}

function normalizeRole(role) {
  if (!role?.name) {
    throw new Error('Role name is required');
  }

  return {
    name: role.name,
    agent: role.agent ?? 'opencode',
    model: role.model ?? null,
    prompt: role.prompt ?? '',
    status: 'pending',
    sessionId: null,
    opencodeUrl: null,
    lastMessage: null,
    updatedAt: null
  };
}

export class SwarmState {
  #idFactory;
  #now;
  #swarms = new Map();

  constructor({ idFactory = createId, now = () => new Date().toISOString() } = {}) {
    this.#idFactory = idFactory;
    this.#now = now;
  }

  createSwarm({ name, projectDir, roles }) {
    if (!name) {
      throw new Error('Swarm name is required');
    }
    if (!projectDir) {
      throw new Error('Project directory is required');
    }
    if (!Array.isArray(roles) || roles.length === 0) {
      throw new Error('At least one role is required');
    }

    const roleEntries = roles.map((role) => {
      const normalized = normalizeRole(role);
      return [normalized.name, normalized];
    });
    const roleNames = roleEntries.map(([roleName]) => roleName);
    if (new Set(roleNames).size !== roleNames.length) {
      throw new Error('Role names must be unique');
    }

    const now = this.#now();
    const swarm = {
      id: this.#idFactory('swarm'),
      name,
      projectDir,
      status: 'created',
      roles: Object.fromEntries(roleEntries),
      tasks: [],
      events: [
        {
          at: now,
          type: 'swarm.created',
          message: `Created swarm ${name}`
        }
      ],
      createdAt: now,
      updatedAt: now
    };

    this.#swarms.set(swarm.id, swarm);
    return snapshot(swarm);
  }

  listSwarms() {
    return [...this.#swarms.values()].map((swarm) => snapshot(swarm));
  }

  getSwarm(swarmId) {
    const swarm = this.#swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Unknown swarm: ${swarmId}`);
    }
    return snapshot(swarm);
  }

  attachSession(swarmId, roleName, { sessionId, opencodeUrl }) {
    const { swarm, role } = this.#getRole(swarmId, roleName);
    const now = this.#now();

    role.sessionId = sessionId;
    role.opencodeUrl = opencodeUrl ?? role.opencodeUrl;
    role.status = 'ready';
    role.updatedAt = now;
    swarm.updatedAt = now;
    swarm.events.push({
      at: now,
      type: 'role.session.attached',
      role: roleName,
      message: `${roleName} connected to opencode session ${sessionId}`
    });

    return snapshot(role);
  }

  addTask(swarmId, { targetRole, title, prompt }) {
    const { swarm } = this.#getRole(swarmId, targetRole);
    const now = this.#now();
    const task = {
      id: this.#idFactory('task'),
      targetRole,
      title,
      prompt,
      status: 'queued',
      createdAt: now,
      updatedAt: now
    };

    swarm.tasks.push(task);
    swarm.updatedAt = now;
    swarm.events.push({
      at: now,
      type: 'task.queued',
      role: targetRole,
      taskId: task.id,
      message: `Queued task for ${targetRole}: ${title}`
    });

    return snapshot(task);
  }

  updateTask(swarmId, taskId, updates) {
    const swarm = this.#getMutableSwarm(swarmId);
    const task = swarm.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      throw new Error(`Unknown task: ${taskId}`);
    }

    Object.assign(task, updates, { updatedAt: this.#now() });
    swarm.updatedAt = task.updatedAt;
    return snapshot(task);
  }

  recordRoleEvent(swarmId, roleName, { type, message, status, taskId, payload }) {
    const { swarm, role } = this.#getRole(swarmId, roleName);
    const now = this.#now();

    if (status) {
      role.status = status;
    }
    role.lastMessage = message ?? role.lastMessage;
    role.updatedAt = now;
    swarm.updatedAt = now;
    swarm.events.push({
      at: now,
      type,
      role: roleName,
      taskId: taskId ?? null,
      message: message ?? '',
      payload: payload ?? null
    });

    return snapshot(role);
  }

  toJSON() {
    return {
      swarms: this.listSwarms()
    };
  }

  #getMutableSwarm(swarmId) {
    const swarm = this.#swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Unknown swarm: ${swarmId}`);
    }
    return swarm;
  }

  #getRole(swarmId, roleName) {
    const swarm = this.#getMutableSwarm(swarmId);
    const role = swarm.roles[roleName];
    if (!role) {
      throw new Error(`Unknown role: ${roleName}`);
    }
    return { swarm, role };
  }
}
