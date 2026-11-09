import {assert, fail} from '../../../shared/errors.mjs';
import {REQUIRED_BACKEND_CAPABILITIES, platformMessageId} from './normalizer.mjs';

export function assertBackendCapabilities(binding) {
  assert(binding?.connectionId && binding.accountId && Array.isArray(binding.capabilities), 'QQ_BACKEND_CAPABILITIES_REQUIRED', '后端未声明可核验的账号、事件和回执能力');
  const missing = REQUIRED_BACKEND_CAPABILITIES.filter(name => !binding.capabilities.includes(name));
  assert(!missing.length, 'QQ_BACKEND_CAPABILITY_MISSING', 'QQ 后端缺少能力：' + missing.join(', '));
  return binding;
}

// Connections are owned by the core. This polls its live event queue, never QQ history.
export class HostOneBotTransport {
  #host; #binding; #controller; #loop; #onDisconnect;
  constructor(host) { this.#host = host; }
  async start({connectionRef, accountId, onEvent, onEpoch, onDisconnect, recipientPolicy}) {
    this.#onDisconnect = onDisconnect;
    const controller = this.#controller = new AbortController();let allocated;
    try {
      allocated = await this.#host.invoke('connections.open', {platform: 'qq', connectionRef, accountId, newEventsOnly: true,...(recipientPolicy?{eventFilter:recipientPolicy()}:{})}, {signal: controller.signal});
      assert(!controller.signal.aborted && this.#controller === controller, 'QQ_CONNECTION_CANCELLED', '账号连接启动已取消');
      const binding = assertBackendCapabilities(allocated);
      assert(binding.accountId === accountId, 'QQ_CONNECTION_ACCOUNT_MISMATCH', '连接账号不匹配');
      this.#binding = binding;this.lastError=null;this.lastCheckedAt=Date.now();onEpoch?.(binding);this.#loop = this.#pump(onEvent, onEpoch,recipientPolicy,controller,binding);return binding;
    } catch (error) {
      controller.abort();
      if (allocated?.connectionId) await this.#host.invoke('connections.close', {connectionId: allocated.connectionId, platform: 'qq'}).catch(() => {});
      if (this.#controller === controller) this.#binding = null;
      throw error;
    }
  }
  async #pump(onEvent, onEpoch,recipientPolicy,controller,binding) {
    let cursor = binding.cursor ?? null,ackCursor=cursor??0,count=0;const pending=[];
    while (!controller.signal.aborted) {
      try {
        while(pending[0]?.done){const first=pending.shift();count-=first.count;if(first.error)throw first.error;ackCursor=first.cursor??ackCursor;}
        if(count>=1000){await pending[0].task;continue;}
        const batch = await this.#host.invoke('connections.events', {connectionId: binding.connectionId, accountId: binding.accountId, cursor, ackCursor, newEventsOnly: true, waitMs: 20000,limit:Math.min(100,1000-count),...(recipientPolicy?{eventFilter:recipientPolicy()}:{})}, {signal: controller.signal});
        if (controller.signal.aborted) break;
        // Each answered poll is a live check of this connection; the page shows it as the last check.
        this.lastCheckedAt = Date.now();
        this.lastError=batch?.transportStatus??null;
        if (batch?.reconnected) onEpoch?.(binding);
        if (batch?.cursor !== undefined) cursor = batch.cursor;
        if(batch?.events?.length){const row={cursor,count:batch.events.length,done:false,error:null};count+=row.count;row.task=Promise.all(batch.events.map(event=>Promise.resolve().then(()=>onEvent(event)))).then(()=>{row.done=true;},error=>{row.error=error;row.done=true;});pending.push(row);}
        // A broken/non-blocking host must not create a hot loop.
        if (!batch?.events?.length) await new Promise(resolve => {
          const signal = controller.signal;
          const done = () => {clearTimeout(timer);signal.removeEventListener('abort', done);resolve();};
          const timer = setTimeout(done, 250); signal.addEventListener('abort', done, {once: true});
          if (signal.aborted) done(); timer.unref?.();
        });
      } catch (error) { if (controller.signal.aborted) break; this.lastError = error.code ?? 'QQ_EVENT_CONNECTION_FAILED'; this.#onDisconnect?.(this.lastError); break; }
    }
    await Promise.allSettled(pending.map(row=>row.task));
  }
  async send({conversationType, peerId, text, requestId, contextToken, leaseId, generation, accountId, characterId, lifeId, operationId, senderId, conversationId, signal}) {
    if (!this.#binding || this.#controller?.signal.aborted || signal?.aborted) {
      const error = fail('QQ_DISCONNECTED', 'QQ 连接未运行');error.notSubmitted = true;throw error;
    }
    if (accountId !== undefined && accountId !== this.#binding.accountId) {const error = fail('QQ_CONNECTION_ACCOUNT_MISMATCH', '发送上下文与托管账号不匹配');error.notSubmitted = true;throw error;}
    const action = conversationType === 'private' ? 'send_private_msg' : 'send_group_msg';
    const params = {message: [{type: 'text', data: {text}}], [conversationType === 'private' ? 'user_id' : 'group_id']: peerId};
    const result = await this.#host.invoke('connections.request', {connectionId: this.#binding.connectionId, accountId: this.#binding.accountId, action, params, requestId, contextToken, leaseId, generation, characterId, lifeId, operationId, senderId, conversationId}, {signal});
    if (result?.status === 'unknown') return {status: 'unknown'};
    if (result?.status === 'sent' && platformMessageId(result.messageId)) return {status: 'sent', messageId: platformMessageId(result.messageId)};
    if (result?.status === 'failed' && result.notSubmitted === true) return {status: 'failed', notSubmitted: true};
    if (result?.status === 'ok' && result.retcode === 0 && platformMessageId(result.data?.message_id)) return {status: 'sent', messageId: platformMessageId(result.data.message_id)};
    return {status: 'unknown'};
  }
  async resolveReply({messageId, conversationId, contextToken, leaseId, generation, accountId, characterId, lifeId, operationId, senderId, signal}) {
    if (!this.#binding || this.#controller?.signal.aborted || signal?.aborted) throw fail('QQ_DISCONNECTED', 'QQ 连接未运行');
    assert(accountId === undefined || accountId === this.#binding.accountId, 'QQ_CONNECTION_ACCOUNT_MISMATCH', '引用上下文与托管账号不匹配');
    return this.#host.invoke('connections.request', {connectionId: this.#binding.connectionId, accountId: this.#binding.accountId, action: 'get_msg', params: {message_id: messageId}, conversationId, contextToken, leaseId, generation, characterId, lifeId, operationId, senderId, purpose: 'verify-quoted-author'}, {signal});
  }
  async close() {
    this.#controller?.abort();
    if (this.#binding) await this.#host.invoke('connections.close', {connectionId: this.#binding.connectionId, platform: 'qq'}).catch(() => {});
    await this.#loop?.catch(() => {});
    this.#binding = null;
  }
}

function loopbackUrl(value, protocols) {
  const url = new URL(value);
  assert(protocols.includes(url.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !url.username && !url.password, 'QQ_ENDPOINT_DENIED', '原创 OneBot 直连适配器仅接受本机受管理端点');
  return url;
}

// Optional transport for an explicitly supplied managed OneBot endpoint. No login,
// installation, history request, process discovery, or process control occurs here.
export class DirectOneBotTransport {
  #http; #ws; #token; #fetch; #WebSocket; #socket; #timer; #closed = true; #binding; #onEvent; #onEpoch; #onDisconnect; #now; #capabilities; #pendingHandshake; #starting = false; #runGeneration = 0; #openingController;
  constructor({httpUrl, webSocketUrl, accessToken = '', capabilities = [], fetchImpl = globalThis.fetch, WebSocketImpl = globalThis.WebSocket, now = Date.now} = {}) {
    this.#http = loopbackUrl(httpUrl, ['http:', 'https:']); this.#ws = loopbackUrl(webSocketUrl, ['ws:', 'wss:']);
    this.#token = accessToken; this.#fetch = fetchImpl; this.#WebSocket = WebSocketImpl; this.#now = now; this.#capabilities = [...capabilities];
  }
  async #request(action, params, signal) {
    const result = await this.#fetch(new URL('/' + action, this.#http), {method: 'POST', headers: {'content-type': 'application/json', ...(this.#token ? {authorization: 'Bearer ' + this.#token} : {})}, body: JSON.stringify(params), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)});
    if (!result.ok) throw fail('QQ_BACKEND_HTTP_FAILED', 'QQ 后端请求失败');
    const body = await result.json();
    assert(body?.status === 'ok' && body.retcode === 0, 'QQ_BACKEND_REQUEST_FAILED', 'QQ 后端未返回成功回执');
    return body.data;
  }
  async start({accountId, onEvent, onEpoch, onDisconnect}) {
    assert(this.#closed && !this.#starting, 'QQ_ALREADY_CONNECTED', '连接已经启动');
    this.#starting = true;const generation = ++this.#runGeneration, controller = this.#openingController = new AbortController();
    try {
      const login = await this.#request('get_login_info', {}, controller.signal);
      assert(generation === this.#runGeneration && !controller.signal.aborted, 'QQ_CONNECTION_CANCELLED', '账号连接启动已取消');
      assert(String(login?.user_id) === accountId, 'QQ_CONNECTION_ACCOUNT_MISMATCH', 'OneBot 登录账号与托管绑定不符');
      this.#binding = assertBackendCapabilities({connectionId: 'onebot:' + accountId, accountId, capabilities: this.#capabilities});
      this.#closed = false; this.#onEvent = onEvent; this.#onEpoch = onEpoch; this.#onDisconnect = onDisconnect;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {this.#pendingHandshake = null;this.#closed = true;this.#socket?.close();reject(fail('QQ_SOCKET_TIMEOUT'));}, 15000);
        this.#pendingHandshake = {reject: error => {clearTimeout(timer);this.#pendingHandshake = null;reject(error);}, resolve: () => {clearTimeout(timer);this.#pendingHandshake = null;resolve();}};
        try {this.#connect(this.#pendingHandshake);} catch (error) {this.#closed = true;this.#pendingHandshake?.reject(error);}
      });
      assert(generation === this.#runGeneration && !controller.signal.aborted, 'QQ_CONNECTION_CANCELLED', '账号连接启动已取消');return this.#binding;
    } finally {this.#starting = false;if (this.#openingController === controller) this.#openingController = null;}
  }
  #connect(initial = null) {
    if (this.#closed) return;
    const url = new URL(this.#ws); if (this.#token) url.searchParams.set('access_token', this.#token);
    const socket = this.#socket = new this.#WebSocket(url);
    let opened = false;
    socket.addEventListener('open', () => { if (!this.#closed && this.#socket === socket) {opened = true;this.#onEpoch?.({...this.#binding, connectedAt: this.#now()});initial?.resolve();} });
    socket.addEventListener('message', event => {
      if (this.#closed || this.#socket !== socket) return;
      try { const raw = JSON.parse(String(event.data)); if (raw.post_type === 'message') Promise.resolve(this.#onEvent?.(raw)).catch(() => {}); } catch {}
    });
    socket.addEventListener('close', () => { if (!this.#closed && this.#socket === socket) {this.#socket = null;this.#closed=true;this.#onDisconnect?.('QQ_SOCKET_CLOSED');if (!opened && initial) initial.reject(fail('QQ_SOCKET_FAILED'));} });
    socket.addEventListener('error', () => { if (this.#closed || this.#socket !== socket) return;this.lastError = 'QQ_SOCKET_FAILED';if (!opened && initial) {this.#closed = true;socket.close();initial.reject(fail('QQ_SOCKET_FAILED'));} });
  }
  async send({conversationType, peerId, text, signal}) {
    if (this.#closed) {const error = fail('QQ_DISCONNECTED', 'QQ 连接已关闭');error.notSubmitted = true;throw error;}
    try {
      const data = await this.#request(conversationType === 'private' ? 'send_private_msg' : 'send_group_msg', {[conversationType === 'private' ? 'user_id' : 'group_id']: peerId, message: [{type: 'text', data: {text}}]}, signal);
      return platformMessageId(data?.message_id) ? {status: 'sent', messageId: platformMessageId(data.message_id)} : {status: 'unknown'};
    } catch { return {status: 'unknown'}; }
  }
  async resolveReply({messageId, signal}) { return this.#request('get_msg', {message_id: messageId}, signal); }
  async close() { this.#closed = true;this.#runGeneration++;this.#openingController?.abort();clearTimeout(this.#timer);this.#pendingHandshake?.reject(fail('QQ_CONNECTION_CANCELLED'));const socket = this.#socket;this.#socket = null;socket?.close(); }
}
