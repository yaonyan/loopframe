import { useCallback, useRef } from "react";
import type { AgentConfig } from "@loopframe/shared";

export function useAcpSession(agent: AgentConfig | null) {
  const sessionIdRef = useRef<string | null>(null);

  const initSession = useCallback(async (envVars: Record<string, string> = {}) => {
    if (!agent) return null;
    try {
      const res = await fetch("/api/acp/init-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent, envVars }),
      });
      const data = await res.json();
      sessionIdRef.current = data.sessionId ?? null;
      return sessionIdRef.current;
    } catch (err) {
      console.error("[useAcpSession] init error:", err);
      return null;
    }
  }, [agent]);

  const cleanupSession = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    sessionIdRef.current = null;
    try {
      await fetch("/api/acp/cleanup-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    } catch {}
  }, []);

  return { initSession, cleanupSession, sessionId: sessionIdRef };
}
