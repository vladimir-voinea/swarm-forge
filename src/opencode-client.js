export class OpenCodeClient {
  #baseUrl;
  #username;
  #password;
  #fetch;

  constructor({ baseUrl = 'http://127.0.0.1:4096', username = null, password = null, fetchImpl = fetch } = {}) {
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#username = username;
    this.#password = password;
    this.#fetch = fetchImpl;
  }

  get baseUrl() {
    return this.#baseUrl;
  }

  async health() {
    return this.#request('GET', '/global/health');
  }

  async createSession({ title }) {
    return this.#request('POST', '/session', { title });
  }

  async sendPromptAsync({ sessionId, agent, model, system, text }) {
    const body = {
      agent,
      model: normalizeModel(model),
      system,
      parts: [{ type: 'text', text }]
    };

    for (const key of ['agent', 'model', 'system']) {
      if (body[key] === undefined || body[key] === null || body[key] === '') {
        delete body[key];
      }
    }

    return this.#request('POST', `/session/${encodeURIComponent(sessionId)}/prompt_async`, body);
  }

  async getSessionStatus() {
    return this.#request('GET', '/session/status');
  }

  async #request(method, path, body) {
    const headers = {
      accept: 'application/json'
    };

    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    if (this.#username !== null && this.#password !== null) {
      headers.authorization = `Basic ${Buffer.from(`${this.#username}:${this.#password}`).toString('base64')}`;
    }

    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`OpenCode request failed: ${method} ${path} returned ${response.status} ${response.statusText}: ${text}`);
    }

    if (text.length === 0) {
      return null;
    }

    return JSON.parse(text);
  }
}

function normalizeModel(model) {
  if (typeof model !== 'string') {
    return model;
  }

  const separator = model.indexOf('/');
  if (separator === -1) {
    return model;
  }

  return {
    providerID: model.slice(0, separator),
    modelID: model.slice(separator + 1)
  };
}
