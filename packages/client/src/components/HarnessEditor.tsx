import { useState } from "react";
import { Save, Code2, Wrench, ShieldAlert } from "lucide-react";
import type { Harness } from "@loopframe/shared";

interface Props {
  harness: Partial<Harness>;
  onChange: (h: Partial<Harness>) => void;
  onSave: () => void;
  saving?: boolean;
}

const SECTIONS = [
  { key: "prompt" as const,      label: "Prompt",      Icon: Code2       },
  { key: "tools" as const,       label: "Tools",       Icon: Wrench      },
  { key: "constraints" as const, label: "Constraints", Icon: ShieldAlert },
];

export function HarnessEditor({ harness, onChange, onSave, saving }: Props) {
  const [section, setSection] = useState<"prompt" | "tools" | "constraints">("prompt");

  return (
    <div
      className="flex flex-col h-full rounded-xl overflow-hidden"
      style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}
    >
      {/* Tab bar */}
      <div
        className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--bg-border)" }}
      >
        <div className="flex gap-0.5">
          {SECTIONS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 cursor-pointer"
              style={{
                backgroundColor: section === key
                  ? "color-mix(in srgb, var(--lf-primary) 12%, transparent)"
                  : "transparent",
                color: section === key ? "var(--lf-primary)" : "var(--text-muted)",
              }}
            >
              <Icon size={12} strokeWidth={2} />
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          className="btn-primary py-1.5 px-3 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Save size={12} strokeWidth={2} />
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Name input */}
      <div
        className="px-3 py-2 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--bg-border)" }}
      >
        <input
          className="w-full text-sm font-medium bg-transparent outline-none"
          placeholder="Harness name…"
          value={harness.name ?? ""}
          onChange={(e) => onChange({ ...harness, name: e.target.value })}
          style={{ color: "var(--text-primary)" }}
        />
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden p-3">
        {section === "prompt" && (
          <textarea
            className="w-full h-full resize-none font-mono text-xs leading-relaxed rounded-lg p-3 outline-none"
            style={{
              backgroundColor: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--bg-border)",
            }}
            placeholder={"Write your system prompt here…\n\nDefine the agent's role, capabilities,\nand constraints."}
            value={harness.systemPrompt ?? ""}
            onChange={(e) => onChange({ ...harness, systemPrompt: e.target.value })}
          />
        )}
        {section === "tools" && (
          <textarea
            className="w-full h-full resize-none font-mono text-xs leading-relaxed rounded-lg p-3 outline-none"
            style={{
              backgroundColor: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--bg-border)",
            }}
            placeholder={"One tool name per line:\nread_file\nwrite_file\nsearch_web"}
            value={(harness.tools ?? []).join("\n")}
            onChange={(e) =>
              onChange({ ...harness, tools: e.target.value.split("\n").filter(Boolean) })
            }
          />
        )}
        {section === "constraints" && (
          <textarea
            className="w-full h-full resize-none font-mono text-xs leading-relaxed rounded-lg p-3 outline-none"
            style={{
              backgroundColor: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--bg-border)",
            }}
            placeholder={"One constraint per line:\nNever delete files without confirmation\nAlways explain reasoning before acting"}
            value={(harness.constraints ?? []).join("\n")}
            onChange={(e) =>
              onChange({
                ...harness,
                constraints: e.target.value.split("\n").filter(Boolean),
              })
            }
          />
        )}
      </div>
    </div>
  );
}
