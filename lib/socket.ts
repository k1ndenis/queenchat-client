class WebSocketManager {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Function[]> = new Map();
  private currentChatId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000;
  private isConnecting = false;
  private pingInterval: number | null = null;

  async connectToChat(chatId: string) {
    if (!chatId || chatId === 'undefined') {
      console.error('❌ Invalid chatId:', chatId);
      return;
    }

    if (this.isConnecting) {
      console.log('⏳ Already connecting, skipping...');
      return;
    }

    if (this.currentChatId && this.currentChatId !== chatId) {
      console.log(`🔄 Switching from chat ${this.currentChatId} to ${chatId}`);
      this.disconnect();
    }

    this.currentChatId = chatId;
    this.isConnecting = true;

    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      const response = await fetch(`${apiUrl}/auth/ws-token`, {
        credentials: 'include',
      });

      if (!response.ok) {
        console.error('❌ Failed to get WebSocket token');
        this.isConnecting = false;
        this.attemptReconnect();
        return;
      }

      const { token } = await response.json();

      if (this.ws) {
        this.ws.close();
      }

      const wsURL = import.meta.env.VITE_WS_URL || 'ws://localhost:3100';
      const url = `${wsURL}/api/chats/ws/${chatId}?token=${token}`;

      console.log(`🔌 Connecting to WebSocket: ${url}`);
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.reconnectAttempts = 0;
        this.isConnecting = false;

        this.pingInterval = window.setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'pong') return;
          
          if (data.type === 'new_message') {
            const callbacks = this.listeners.get('new-message');
            if (callbacks) {
              callbacks.forEach(cb => cb(data.message));
            }
          } else if (data.type === 'message_read') {
            const callbacks = this.listeners.get('message_read');
            if (callbacks) {
              callbacks.forEach(cb => cb(data));
            }
          } else {
            const eventName = data.type;
            const callbacks = this.listeners.get(eventName);
            if (callbacks) {
              callbacks.forEach(cb => cb(data));
            }
          }
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        this.isConnecting = false;
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
      };
    } catch (error) {
      console.error('❌ Error connecting to WebSocket:', error);
      this.isConnecting = false;
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('❌ Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 3);
    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      if (this.currentChatId && !this.isConnecting && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
        this.connectToChat(this.currentChatId);
      }
    }, delay);
  }

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback?: Function) {
    if (!callback) {
      this.listeners.delete(event);
    } else {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index !== -1) callbacks.splice(index, 1);
      }
    }
  }

  emit(event: string, data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: event, ...data }));
    } else {
      console.warn('⚠️ WebSocket not connected, message not sent');
    }
  }

  disconnect() {
    console.log('🔌 Disconnecting WebSocket');
    this.reconnectAttempts = this.maxReconnectAttempts;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.currentChatId = null;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

export const socket = new WebSocketManager();