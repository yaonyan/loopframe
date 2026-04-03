import { Settings, Terminal, ChevronRight } from "lucide-react";
import type { AgentConfig } from "@loopframe/shared";
import { useAgentConfig } from "../hooks/useAgentConfig";

const AVAILABLE_AGENTS: AgentConfig[] = [
  { id: "codebuddy",  name: "CodeBuddy",   command: "codebuddy", args: ["--acp"] },
  { id: "claude-code", name: "Claude Code", command: "claude",    args: ["--acp"] },
  { id: "gemini-cli", name: "Gemini CLI",  command: "gemini",    args: ["--acp"] },
  { id: "codex-cli",  name: "Codex CLI",   command: "codex",     args: ["--acp"] },
  { id: "custom",     name: "Custom",      command: "",          args: ["--acp"] },
];

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-bg-border">
        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest">
          {title}
        </h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const { config, setConfig } = useAgentConfig();

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 h-12 border-b border-bg-border flex-shrink-0">
        <Settings size={15} className="text-text-muted" strokeWidth={2} />
        <div>
          <span className="text-sm font-medium text-text-primary">Settings</span>
          <span className="ml-2 text-xs text-text-muted">Configure your ACP agent connection</span>
        </div>
      </div>

      <div className="p-5 space-y-4 max-w-lg">
        {/* Agent selector */}
        <SectionCard title="ACP Agent">
          <div className="space-y-0.5">
            {AVAILABLE_AGENTS.map((agent) => {
              const isSelected = config.id === agent.id;
              return (
                <button
                  key={agent.id}
                  onClick={() => setConfig({ ...agent })}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                              text-left transition-colors duration-150 cursor-pointer ${
                    isSelected
                      ? "bg-primary/10 border border-primary/20"
                      : "hover:bg-bg-elevated border border-transparent"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected ? "border-primary" : "border-bg-border"
                    }`}
                  >
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <span className={`text-sm flex-1 ${isSelected ? "text-text-primary font-medium" : "text-text-secondary"}`}>
                    {agent.name}
                  </span>
                  {agent.command && (
                    <span className="text-xs text-text-muted font-mono">{agent.command}</span>
                  )}
                  {isSelected && (
                    <ChevronRight size={13} className="text-primary flex-shrink-0" strokeWidth={2} />
                  )}
                </button>
              );
            })}
          </div>
        </SectionCard>

        {/* Command override */}
        <SectionCard title="Command Override">
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Command</label>
              <input
                className="input font-mono"
                value={config.command}
                onChange={(e) => setConfig({ ...config, command: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Args <span className="opacity-60">(JSON array)</span></label>
              <input
                className="input font-mono"
                value={JSON.stringify(config.args)}
                onChange={(e) => {
                  try { setConfig({ ...config, args: JSON.parse(e.target.value) }); } catch {}
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1.5">Model <span className="opacity-60">(optional)</span></label>
                <input
                  className="input font-mono text-xs"
                  placeholder="claude-3-5-sonnet…"
                  value={config.acpModel ?? ""}
                  onChange={(e) => setConfig({ ...config, acpModel: e.target.value || undefined })}
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1.5">Mode <span className="opacity-60">(optional)</span></label>
                <input
                  className="input font-mono text-xs"
                  placeholder="auto"
                  value={config.acpMode ?? ""}
                  onChange={(e) => setConfig({ ...config, acpMode: e.target.value || undefined })}
                />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Config preview */}
        <SectionCard title="Current Config">
          <div className="flex items-start gap-2">
            <Terminal size={12} className="text-text-muted mt-0.5 flex-shrink-0" strokeWidth={2} />
            <pre className="text-xs font-mono text-text-muted leading-relaxed overflow-auto">
              {JSON.stringify(config, null, 2)}
            </pre>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
