import { useEffect, useRef } from "react";
import { TerminalSquare, Trash2, Wifi, WifiOff } from "lucide-react";
import type { WsMessage } from "@loopframe/shared";
import { useWebSocket } from "../hooks/useWebSocket";

function formatMsg(msg: WsMessage): { text: string; level: "info" | "success" | "error" | "muted" } {
  const t = new Date(msg.ts).toLocaleTimeString("en-US", { hour12: false });
  const p = msg.payload as any;
  switch (msg.type) {
    case "log":
      return { text: `[${t}] ${p.msg}`, level: "info" };
    case "regulation:start":
    case "evolve:start":
      return { text: `[${t}] Regulation started — harness ${p.harnessId}`, level: "info" };
    case "regulation:actuate":
    case "evolve:task-start":
      return { text: `[${t}] > Iteration ${p.iteration}`, level: "muted" };
    case "regulation:decision": {
      const d = p.decision;
      if (!d) return { text: `[${t}] decision received`, level: "muted" };
      if (d.type === "ATTENUATE") return { text: `[${t}] ATTENUATE: ${d.actuation_description}`, level: "info" };
      return { text: `[${t}] ${d.type}: ${(d.reasoning ?? "").slice(0, 80)}`, level: "muted" };
    }
    case "regulation:committed":
      return { text: `[${t}] ✓ Actuation committed`, level: "success" };
    case "regulation:reverted":
      return { text: `[${t}] ✗ Actuation reverted`, level: "muted" };
    case "evolve:task-done": {
      const s = p.summary;
      return {
        text: `[${t}] iter ${p.iteration} — ${s?.passed}/${s?.total} passed, avg=${s?.avg_score}`,
        level: s?.passed === s?.total ? "success" : "info",
      };
    }
    case "regulation:done":
    case "evolve:done":
      return { text: `[${t}] Regulation complete`, level: "success" };
    case "regulation:error":
    case "evolve:error":
      return { text: `[${t}] Error: ${p.error}`, level: "error" };
    case "task:start":
      return { text: `[${t}] Task started — ${p.instruction}`, level: "info" };
    case "task:done":
      return { text: `[${t}] Task done — ${p.steps} steps, ${p.duration_ms}ms`, level: "success" };
    case "task:error":
      return { text: `[${t}] Task error: ${p.error}`, level: "error" };
    default:
      return { text: `[${t}] ${msg.type}`, level: "muted" };
  }
}

const LEVEL_CLASS = {
  info:    "text-text-secondary",
  success: "text-primary",
  error:   "text-error",
  muted:   "text-text-muted",
};

export function Terminal() {
  const { messages, connected, clear } = useWebSocket(
    `ws://${window.location.host}/ws`,
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-full rounded-xl border border-bg-border overflow-hidden bg-bg-base">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bg-border bg-bg-surface flex-shrink-0">
        <div className="flex items-center gap-2">
          <TerminalSquare size={14} className="text-text-muted" strokeWidth={2} />
          <span className="text-xs font-mono text-text-secondary">Terminal</span>
          <div className="flex items-center gap-1">
            {connected ? (
              <Wifi size={11} className="text-primary" strokeWidth={2} />
            ) : (
              <WifiOff size={11} className="text-warning" strokeWidth={2} />
            )}
          </div>
        </div>
        <button onClick={clear} className="btn-icon w-6 h-6" aria-label="Clear terminal">
          <Trash2 size={12} strokeWidth={2} />
        </button>
      </div>

      {/* Log output */}
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-0.5">
        {messages.length === 0 ? (
          <p className="text-text-muted">Waiting for events…</p>
        ) : (
          messages.map((m, i) => {
            const { text, level } = formatMsg(m);
            return (
              <div key={i} className={`leading-5 ${LEVEL_CLASS[level]}`}>
                {text}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
