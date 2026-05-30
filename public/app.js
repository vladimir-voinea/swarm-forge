const state = {
  health: null,
  swarms: [],
  selectedSwarmId: null
};

const elements = {
  connectionState: document.querySelector('#connection-state'),
  connectionLabel: document.querySelector('#connection-label'),
  refreshButton: document.querySelector('#refresh-button'),
  swarmForm: document.querySelector('#swarm-form'),
  taskForm: document.querySelector('#task-form'),
  swarmList: document.querySelector('#swarm-list'),
  roleGrid: document.querySelector('#role-grid'),
  roleCount: document.querySelector('#role-count'),
  eventCount: document.querySelector('#event-count'),
  taskCount: document.querySelector('#task-count'),
  selectedSwarmLabel: document.querySelector('#selected-swarm-label'),
  targetRole: document.querySelector('#target-role'),
  timeline: document.querySelector('#event-timeline'),
  transcript: document.querySelector('#transcript-list'),
  toast: document.querySelector('#toast')
};

elements.refreshButton.addEventListener('click', () => refresh());
elements.swarmForm.addEventListener('submit', createSwarm);
elements.taskForm.addEventListener('submit', dispatchTask);

refresh();

async function refresh() {
  await Promise.allSettled([loadHealth(), loadSwarms()]);
  render();
}

async function loadHealth() {
  try {
    state.health = await api('/api/health');
    elements.connectionState.dataset.state = 'online';
    elements.connectionLabel.textContent = `Coordinator online · ${state.health.swarms} swarms`;
  } catch (error) {
    state.health = null;
    elements.connectionState.dataset.state = 'offline';
    elements.connectionLabel.textContent = error.message;
  }
}

async function loadSwarms() {
  const body = await api('/api/swarms');
  state.swarms = body.swarms;
  if (!state.selectedSwarmId && state.swarms.length > 0) {
    state.selectedSwarmId = state.swarms[0].id;
  }
  if (state.selectedSwarmId && !state.swarms.some((swarm) => swarm.id === state.selectedSwarmId)) {
    state.selectedSwarmId = state.swarms[0]?.id ?? null;
  }
}

async function createSwarm(event) {
  event.preventDefault();
  const form = new FormData(elements.swarmForm);
  const selectedModel = String(form.get('model')).trim();
  const roles = String(form.get('roles'))
    .split(/\r?\n|,/)
    .map((role) => role.trim())
    .filter(Boolean)
    .map((name) => ({ name, model: selectedModel }));

  try {
    const body = await api('/api/swarms', {
      method: 'POST',
      body: {
        name: String(form.get('name')).trim(),
        projectDir: String(form.get('projectDir')).trim(),
        roles
      }
    });
    state.selectedSwarmId = body.swarm.id;
    showToast(`Created ${body.swarm.name}`);
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
}

async function dispatchTask(event) {
  event.preventDefault();
  const swarm = selectedSwarm();
  if (!swarm) {
    showToast('Select a swarm before dispatching work.');
    return;
  }

  const form = new FormData(elements.taskForm);
  try {
    const body = await api(`/api/swarms/${encodeURIComponent(swarm.id)}/tasks`, {
      method: 'POST',
      body: {
        targetRole: String(form.get('targetRole')),
        title: String(form.get('title')).trim(),
        prompt: String(form.get('prompt')).trim()
      }
    });
    showToast(`Sent ${body.task.title}`);
    elements.taskForm.reset();
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers: { 'content-type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }
  return body;
}

function render() {
  const swarm = selectedSwarm();
  renderSwarmList();
  renderRoles(swarm);
  renderTaskForm(swarm);
  renderTimeline(swarm);
  renderTranscript(swarm);
}

function selectedSwarm() {
  return state.swarms.find((swarm) => swarm.id === state.selectedSwarmId) ?? null;
}

function renderSwarmList() {
  elements.swarmList.replaceChildren();
  if (state.swarms.length === 0) {
    elements.swarmList.append(emptyState('No swarms'));
    return;
  }

  for (const swarm of state.swarms) {
    const button = document.createElement('button');
    button.className = 'swarm-button';
    button.type = 'button';
    button.ariaCurrent = swarm.id === state.selectedSwarmId ? 'true' : 'false';
    button.textContent = `${swarm.name} · ${Object.keys(swarm.roles).length} roles`;
    button.addEventListener('click', () => {
      state.selectedSwarmId = swarm.id;
      render();
    });
    elements.swarmList.append(button);
  }
}

function renderRoles(swarm) {
  elements.roleGrid.replaceChildren();
  const roles = swarm ? Object.values(swarm.roles) : [];
  elements.roleCount.textContent = `${roles.length} active`;

  if (roles.length === 0) {
    elements.roleGrid.append(emptyState('No role sessions'));
    return;
  }

  for (const role of roles) {
    const card = document.createElement('article');
    card.className = 'role-card';
    const title = document.createElement('h3');
    title.textContent = role.name;
    const status = document.createElement('span');
    status.className = `status-badge status-${role.status}`;
    status.textContent = role.status;
    const meta = document.createElement('div');
    meta.className = 'role-meta';
    meta.append(line('Session', role.sessionId ?? 'pending'));
    meta.append(line('Model', role.model ?? 'default'));
    meta.append(line('Last', role.lastMessage ?? 'No activity'));
    card.append(title, status, meta);
    elements.roleGrid.append(card);
  }
}

function renderTaskForm(swarm) {
  elements.targetRole.replaceChildren();
  elements.selectedSwarmLabel.textContent = swarm ? swarm.name : 'No swarm selected';
  elements.taskForm.querySelector('button').disabled = !swarm;

  if (!swarm) {
    return;
  }

  for (const role of Object.values(swarm.roles)) {
    const option = document.createElement('option');
    option.value = role.name;
    option.textContent = role.name;
    elements.targetRole.append(option);
  }
}

function renderTimeline(swarm) {
  elements.timeline.replaceChildren();
  const events = swarm?.events ?? [];
  elements.eventCount.textContent = `${events.length} events`;

  if (events.length === 0) {
    elements.timeline.append(emptyState('No timeline events'));
    return;
  }

  for (const event of events.toReversed()) {
    const item = document.createElement('li');
    item.className = 'event-item';
    const time = document.createElement('time');
    time.textContent = formatTime(event.at);
    const message = document.createElement('p');
    message.textContent = `${event.type}${event.role ? ` · ${event.role}` : ''}: ${event.message}`;
    item.append(time, message);
    elements.timeline.append(item);
  }
}

function renderTranscript(swarm) {
  elements.transcript.replaceChildren();
  const tasks = swarm?.tasks ?? [];
  elements.taskCount.textContent = `${tasks.length} tasks`;

  if (!swarm) {
    elements.transcript.append(emptyState('No selected swarm'));
    return;
  }

  const entries = [
    ...tasks.map((task) => ({
      title: `${task.targetRole} · ${task.status}`,
      text: `${task.title}: ${task.prompt}`
    })),
    ...swarm.events.slice(-6).map((event) => ({
      title: `${event.type}${event.role ? ` · ${event.role}` : ''}`,
      text: event.message
    }))
  ].toReversed();

  if (entries.length === 0) {
    elements.transcript.append(emptyState('No transcript entries'));
    return;
  }

  for (const entry of entries) {
    const node = document.createElement('article');
    node.className = 'transcript-entry';
    const title = document.createElement('strong');
    title.textContent = entry.title;
    const text = document.createElement('p');
    text.textContent = entry.text;
    node.append(title, text);
    elements.transcript.append(node);
  }
}

function line(label, value) {
  const node = document.createElement('span');
  node.textContent = `${label}: ${value}`;
  return node;
}

function emptyState(text) {
  const node = document.createElement('div');
  node.className = 'empty-state';
  node.textContent = text;
  return node;
}

function formatTime(value) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.dataset.visible = 'true';
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => {
    elements.toast.dataset.visible = 'false';
  }, 3800);
}
