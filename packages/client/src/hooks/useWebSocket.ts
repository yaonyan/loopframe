import { useEffect, useRef, useState } from "react";
import type { WsMessage } from "@loopframe/shared";

export function useWebSocket(url: string) {
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onmessage = (e) => {
        try {
          const msg: WsMessage = JSON.parse(e.data);
          setMessages((prev) => [...prev.slice(-500), msg]);
        } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
        retryRef.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      retryRef.current && clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [url]);

  const clear = () => setMessages([]);

  return { messages, connected, clear };
}
