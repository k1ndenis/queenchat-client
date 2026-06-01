class WebSocketManager {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Function[]> = new Map();
  private chatId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000; // 5 секунд
  private isConnecting = false;
  private pingInterval: number | null = null;

  async connectToChat(chatId: string) {
    if (this.isConnecting) {
      return;
    }

    this.chatId = chatId;
    this.isConnecting = true;

    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      const response = await fetch(`${apiUrl}/auth/ws-token`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        console.error('Failed to get WebSocket token');
        this.isConnecting = false;
        this.attemptReconnect();
        return;
      }
      
      const { token } = await response.json();
      
      if (this.ws) {
        this.ws.close();
      }

      const wsURL = import.meta.env.VITE_WS_URL;
      const url = `${wsURL}/api/chats/ws/${chatId}?token=${token}`;
      
      this.ws = new WebSocket(url);
      
      this.ws.onopen = () => {
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
          } else {
            const eventName = data.type;
            const callbacks = this.listeners.get(eventName);
            if (callbacks) {
              callbacks.forEach(cb => cb(data));
            }
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      this.ws.onclose = () => {
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        this.isConnecting = false;
        this.attemptReconnect();
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
      this.isConnecting = false;
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 3);
    
    setTimeout(() => {
      if (this.chatId && !this.isConnecting && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
        this.connectToChat(this.chatId);
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
    }
  }

  disconnect() {
    this.reconnectAttempts = this.maxReconnectAttempts;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const socket = new WebSocketManager();