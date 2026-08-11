type SocketEvent = Record<string, unknown>;

const PONG_TIMEOUT_MS = 4_000;
const VERIFIED_FOR_MS = 5_000;
const HEARTBEAT_MS = 25_000;

const wait = (milliseconds: number) => new Promise<void>(resolve => window.setTimeout(resolve, milliseconds));

class WebSocketManager {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Function[]>();
  private currentChatId: string | null = null;
  private isGlobal = false;
  private connectionPromise: Promise<void> | null = null;
  private connectionReject: ((error: Error) => void) | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private heartbeatTimer: number | null = null;
  private lastPongAt = 0;
  private pendingPings = new Map<string, { resolve: () => void; reject: (error: Error) => void; timeout: number }>();
  private healthPromise: Promise<void> | null = null;
  private sendQueue: Promise<void> = Promise.resolve();
  private wsToken: string | null = null;
  private wsTokenExpiresAt = 0;

  connect(source = 'unknown'): Promise<void> {
    this.isGlobal = true;
    this.currentChatId = null;
    // A previous logout deliberately exhausts the reconnect budget. A new
    // authenticated session must be allowed to reconnect again.
    this.reconnectAttempts = 0;
    return this.openConnection();
  }

  connectToChat(chatId: string): Promise<void> {
    if (!chatId || chatId === 'undefined') {
      return Promise.reject(new Error('Invalid chat id'));
    }
    if (this.currentChatId && this.currentChatId !== chatId) {
      this.closeSocket(false);
    }
    this.isGlobal = false;
    this.currentChatId = chatId;
    return this.openConnection();
  }

  async ensureConnectedAndAlive(): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.openConnection();
        await this.verifyAlive();
        return;
      } catch (error) {
        console.warn('[WSHealth] connection healthcheck failed', {
          attempt: attempt + 1,
          error: error instanceof Error ? error.message : String(error),
        });
        this.closeSocket(false);
        if (attempt === 0) {
          console.info('[WSHealth] reconnect started');
          await wait(150);
        }
      }
    }
    throw new Error('WebSocket is unavailable');
  }

  sendReliable(event: string, data: SocketEvent = {}): Promise<void> {
    const task = this.sendQueue.catch(() => undefined).then(async () => {
      await this.ensureConnectedAndAlive();
      const websocket = this.ws;
      if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket closed before send');
      }
      // Do not retry after send(): without an application acknowledgement the
      // server may already have processed a non-idempotent event. `send()`
      // only proves that the browser accepted the frame; it is not a backend
      // acknowledgement, so emit must reject whenever it cannot write it.
      const envelope = { type: event, ...data };
      try {
        websocket.send(JSON.stringify(envelope));
      } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
      }
      console.info('[WSHealth] reliable send accepted by transport', {
        event,
        scope: this.isGlobal ? 'global' : this.currentChatId,
      });
    });
    this.sendQueue = task;
    return task;
  }

  emit(event: string, data: SocketEvent = {}): Promise<void> {
    return this.sendReliable(event, data);
  }

  private openConnection(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connectionPromise) return this.connectionPromise;

    const chatId = this.currentChatId;
    const global = this.isGlobal;
    if (!global && !chatId) return Promise.reject(new Error('No WebSocket target selected'));

    this.connectionPromise = new Promise<void>((resolve, reject) => {
      this.connectionReject = reject;
      void (async () => {
        try {
          const apiUrl = import.meta.env.VITE_API_URL;
          const token = await this.getWebSocketToken(apiUrl);
          const wsURL = import.meta.env.VITE_WS_URL || 'wss://queenchat.ru';
          const path = global ? '/api/chats/ws/global' : `/api/chats/ws/${chatId}`;
          if (global) console.info('[SocketTrace] global_connect_start');
          const websocket = new WebSocket(`${wsURL}${path}?token=${token}`);

          websocket.onopen = () => {
            if (this.ws !== websocket) return;
            this.reconnectAttempts = 0;
            this.connectionPromise = null;
            this.connectionReject = null;
            this.startHeartbeat();
            if (global) console.info('[SocketTrace] global_open');
            console.info('[WSHealth] reconnect success', { scope: global ? 'global' : chatId });
            this.dispatch('connect', { scope: global ? 'global' : chatId });
            this.dispatch('reconnect', { scope: global ? 'global' : chatId });
            resolve();
          };

          websocket.onmessage = event => this.handleMessage(event.data);

          websocket.onclose = event => {
            if (this.ws !== websocket) return;
            if (global) console.warn('[SocketTrace] global_close', {
              code: event.code,
              reason: event.reason || '(empty)',
              wasClean: event.wasClean,
            });
            console.warn('[WSHealth] socket closed', { scope: global ? 'global' : chatId });
            this.ws = null;
            this.connectionPromise = null;
            this.connectionReject?.(new Error('WebSocket closed before open'));
            this.connectionReject = null;
            this.stopHeartbeat();
            this.rejectPendingPings(new Error('WebSocket closed'));
            this.scheduleReconnect();
          };

          websocket.onerror = () => {
            if (global) console.error('[SocketTrace] global_error');
            console.warn('[WSHealth] socket error', { scope: global ? 'global' : chatId });
          };

          this.ws = websocket;
        } catch (error) {
          this.connectionPromise = null;
          this.connectionReject = null;
          this.scheduleReconnect();
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    });
    return this.connectionPromise;
  }

  private async getWebSocketToken(apiUrl: string): Promise<string> {
    // Reconnects must not mint a fresh JWT each time. Keep it only in memory
    // and refresh shortly before its own expiry; it is cleared on disconnect.
    if (this.wsToken && Date.now() < this.wsTokenExpiresAt) return this.wsToken;

    const response = await fetch(`${apiUrl}/auth/ws-token`, { credentials: 'include' });
    if (!response.ok) throw new Error(`WebSocket token request failed: ${response.status}`);
    const { token } = await response.json();
    if (typeof token !== 'string' || !token) throw new Error('WebSocket token missing');

    let expiresAt = Date.now() + 5 * 60_000;
    try {
      const encodedPayload = token.split('.')[1];
      const payload = JSON.parse(atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/')));
      if (typeof payload.exp === 'number') expiresAt = payload.exp * 1000 - 30_000;
    } catch {
      // A short in-memory fallback avoids a render/reconnect token loop even
      // if a future token format no longer exposes an exp claim.
    }
    this.wsToken = token;
    this.wsTokenExpiresAt = Math.max(Date.now() + 1_000, expiresAt);
    return token;
  }

  private handleMessage(raw: unknown) {
    try {
      const data = JSON.parse(String(raw));
      if (data.type === 'pong') {
        this.lastPongAt = Date.now();
        const requestId = data.request_id;
        const pending = requestId ? this.pendingPings.get(requestId) : undefined;
        if (pending) {
          window.clearTimeout(pending.timeout);
          this.pendingPings.delete(requestId);
          pending.resolve();
        }
        console.info('[WSHealth] pong received', { request_id: requestId || 'heartbeat' });
        return;
      }

      if (this.isGlobal) {
        this.dispatch(data.type, data);
        return;
      }
      if (data.type === 'notification') {
        this.dispatch('notification', data);
      } else if (data.type === 'new_message') {
        this.dispatch('new-message', data.message);
      } else {
        this.dispatch(data.type, data);
      }
    } catch (error) {
      console.error('WebSocket message parse failed:', error);
    }
  }

  private verifyAlive(force = false): Promise<void> {
    if (!force && Date.now() - this.lastPongAt < VERIFIED_FOR_MS) return Promise.resolve();
    if (this.healthPromise) return this.healthPromise;
    const websocket = this.ws;
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket is not open'));
    }
    const requestId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.healthPromise = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pendingPings.delete(requestId);
        console.warn('[WSHealth] pong timeout', { request_id: requestId });
        reject(new Error('WebSocket pong timeout'));
      }, PONG_TIMEOUT_MS);
      this.pendingPings.set(requestId, { resolve, reject, timeout });
      try {
        websocket.send(JSON.stringify({ type: 'ping', request_id: requestId }));
        console.info('[WSHealth] ping sent', { request_id: requestId });
      } catch (error) {
        window.clearTimeout(timeout);
        this.pendingPings.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }).finally(() => {
      this.healthPromise = null;
    });
    return this.healthPromise;
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      void this.verifyAlive(true).catch(() => {
        console.warn('[WSHealth] stale connection removed');
        this.closeSocket(true);
      });
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private rejectPendingPings(error: Error) {
    this.pendingPings.forEach(pending => {
      window.clearTimeout(pending.timeout);
      pending.reject(error);
    });
    this.pendingPings.clear();
  }

  private closeSocket(reconnect: boolean) {
    const websocket = this.ws;
    this.ws = null;
    this.connectionPromise = null;
    this.connectionReject?.(new Error('WebSocket closed'));
    this.connectionReject = null;
    this.stopHeartbeat();
    this.rejectPendingPings(new Error('WebSocket closed'));
    if (websocket && websocket.readyState !== WebSocket.CLOSED) websocket.close();
    if (reconnect) this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(1_000 * this.reconnectAttempts, 5_000);
    if (this.isGlobal) console.info('[SocketTrace] reconnect_scheduled', { attempt: this.reconnectAttempts, delay });
    console.info('[WSHealth] reconnect started', { attempt: this.reconnectAttempts, delay });
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.openConnection().catch(() => undefined);
    }, delay);
  }

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback?: Function) {
    if (!callback) {
      this.listeners.delete(event);
      return;
    }
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;
    const index = callbacks.indexOf(callback);
    if (index !== -1) callbacks.splice(index, 1);
  }

  private dispatch(event: string, data: unknown) {
    this.listeners.get(event)?.forEach(callback => callback(data));
  }

  disconnect(source = 'unknown') {
    if (this.isGlobal) console.info('[SocketTrace] disconnect_called', { source });
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAttempts = this.maxReconnectAttempts;
    this.currentChatId = null;
    this.isGlobal = false;
    this.wsToken = null;
    this.wsTokenExpiresAt = 0;
    this.closeSocket(false);
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  hasTarget(): boolean {
    return this.isGlobal || this.currentChatId !== null;
  }

  /** The selected endpoint, useful for guarding a chat-scoped send. */
  getScope(): 'global' | string | null {
    return this.isGlobal ? 'global' : this.currentChatId;
  }
}

export const globalSocket = new WebSocketManager();
export const chatSocket = new WebSocketManager();
export const socket = chatSocket;
