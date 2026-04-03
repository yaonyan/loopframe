import { useState, useCallback, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Send, Square, MessageSquare } from "lucide-react";
import type { Harness } from "@loopframe/shared";
import { HarnessEditor } from "../components/HarnessEditor";
import { MessageRenderer } from "../components/MessageRenderer";
import { useAgentConfig } from "../hooks/useAgentConfig";
import { useAcpSession } from "../hooks/useAcpSession";

export function ForgePage() {
  const { config: agentConfig } = useAgentConfig();
  const { initSession, cleanupSession, sessionId } = useAcpSession(agentConfig);

  const [harness, setHarness] = useState<Partial<Harness>>({
    name: "New Harness",
    domain: "general",
    systemPrompt: "",
    tools: [],
    constraints: [],
    tags: [],
    color: "#22c55e",
  });
  const [saving, setSaving] = useState(false);
  const [input, setInput] = useState("");

  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/acp/chat" }),
  });

  useEffect(() => {
    initSession();
    return () => { cleanupSession(); };
  }, [initSession, cleanupSession]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || status === "streaming") return;
    const text = input.trim();
    setInput("");
    await sendMessage(
      { parts: [{ type: "text", text }] },
      { body: { agent: agentConfig, sessionId: sessionId.current } },
    );
  }, [input, status, sendMessage, agentConfig, sessionId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await fetch("/api/harness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...harness,
          id: harness.id ?? `h-${Date.now()}`,
          evolveCount: 0,
        }),
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [harness]);

  const isStreaming = status === "streaming";

  return (
    <div className="flex h-full">
      {/* ── Chat panel ── */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-bg-border">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 h-12 border-b border-bg-border flex-shrink-0">
          <MessageSquare size={15} className="text-text-muted" strokeWidth={2} />
          <div>
            <span className="text-sm font-medium text-text-primary">Forge</span>
            <span className="ml-2 text-xs text-text-muted">
              Collaborate with AI to build your harness
            </span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <MessageSquare size={18} className="text-primary" strokeWidth={2} />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  Start forging your harness
                </p>
                <p className="text-xs text-text-muted mt-1 max-w-xs">
                  Describe a domain or task — the agent will help craft a reusable harness template.
                </p>
              </div>
            </div>
          )}
          <MessageRenderer messages={messages} isStreaming={isStreaming} />
          {isStreaming && messages.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 mt-2">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
              <span className="text-xs text-text-muted">Agent is thinking…</span>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-5 py-3 border-t border-bg-border flex-shrink-0">
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="Describe a harness, ask for improvements…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            {isStreaming ? (
              <button
                onClick={stop}
                className="btn-icon w-9 h-9 bg-bg-elevated border border-bg-border"
                aria-label="Stop"
              >
                <Square size={14} strokeWidth={2} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="btn-primary px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Send"
              >
                <Send size={14} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Harness editor ── */}
      <div className="w-96 flex-shrink-0 p-4">
        <HarnessEditor
          harness={harness}
          onChange={setHarness}
          onSave={handleSave}
          saving={saving}
        />
      </div>
    </div>
  );
}
