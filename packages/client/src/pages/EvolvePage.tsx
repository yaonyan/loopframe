import { useState, useEffect, useCallback, useRef } from "react";
import {
  Square, RefreshCw, MessageSquare, Send,
  FolderOpen, Zap, FlaskConical, ChevronRight, RotateCcw,
  GitBranch, Loader2,
} from "lucide-react";
import type { Harness, EvolveState, WorkspaceConfig, RunTaskResult, TrajectoryStep, AssertionResult, Task } from "@loopframe/shared";
import { Terminal } from "../components/Terminal";
import { useAgentConfig } from "../hooks/useAgentConfig";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

// ─── Workspace selector ───────────────────────────────────────────────────────

const STORAGE_KEY_WS = "loopframe:workspaces";

function loadWorkspaces(): WorkspaceConfig[] {
  try {
    const s = localStorage.getItem(STORAGE_KEY_WS);
    return s ? JSON.parse(s) : [];
  } catch { return []; }
}

function saveWorkspaces(ws: WorkspaceConfig[]) {
  localStorage.setItem(STORAGE_KEY_WS, JSON.stringify(ws));
}

function WorkspacePicker({
  selected,
  onSelect,
}: {
  selected: WorkspaceConfig | null;
  onSelect: (w: WorkspaceConfig | null) => void;
}) {
  const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>(loadWorkspaces);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [path, setPath] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pick folder via browser file dialog → populate path field
  const handlePickFolder = () => fileInputRef.current?.click();

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    // Extract directory from first file's webkitRelativePath
    const rel = (files[0] as any).webkitRelativePath as string | undefined;
    const dirName = rel ? rel.split("/")[0] : files[0].name;
    // Best-effort: use the name as label; user must confirm the absolute path
    setLabel((prev) => prev || dirName);
    // We can't get the real absolute path from the browser — show the dir name
    // so user knows which folder was picked, they can correct the prefix if needed
    setPath((prev) => prev || dirName);
    setAdding(true);
    e.target.value = "";
  };

  const handleAdd = () => {
    if (!label.trim() || !path.trim()) return;
    const w: WorkspaceConfig = { id: `ws-${Date.now()}`, label: label.trim(), path: path.trim() };
    const next = [...workspaces, w];
    setWorkspaces(next);
    saveWorkspaces(next);
    onSelect(w);
    setAdding(false);
    setLabel(""); setPath("");
  };

  const handleRemove = (id: string) => {
    const next = workspaces.filter((w) => w.id !== id);
    setWorkspaces(next);
    saveWorkspaces(next);
    if (selected?.id === id) onSelect(null);
  };

  return (
    <div className="space-y-1">
      {/* Hidden folder input */}
      <input
        ref={fileInputRef}
        type="file"
        // @ts-ignore — webkitdirectory is non-standard but works in all modern browsers
        webkitdirectory=""
        className="hidden"
        onChange={handleFileInput}
      />

      {workspaces.map((w) => (
        <div
          key={w.id}
          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer group transition-colors ${
            selected?.id === w.id
              ? "bg-primary/10 border border-primary/20"
              : "hover:bg-bg-elevated border border-transparent"
          }`}
          onClick={() => onSelect(selected?.id === w.id ? null : w)}
        >
          <FolderOpen size={12} className={selected?.id === w.id ? "text-primary" : "text-text-muted"} strokeWidth={2} />
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-medium truncate ${selected?.id === w.id ? "text-primary" : "text-text-secondary"}`}>
              {w.label}
            </p>
            <p className="text-[10px] text-text-muted font-mono truncate">{w.path}</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); handleRemove(w.id); }}
            className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error transition-all text-xs px-1 cursor-pointer"
          >×</button>
        </div>
      ))}

      {adding ? (
        <div className="space-y-1.5 p-2 bg-bg-elevated rounded-lg border border-bg-border">
          <input
            className="input text-xs w-full"
            placeholder="Label (e.g. my-project)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
          />
          <div className="flex gap-1">
            <input
              className="input text-xs font-mono flex-1 min-w-0"
              placeholder="/absolute/path/to/workspace"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAdding(false); }}
            />
            <button
              onClick={handlePickFolder}
              className="btn-icon flex-shrink-0"
              title="Browse folder"
            >
              <FolderOpen size={12} strokeWidth={2} />
            </button>
          </div>
          <div className="flex gap-1.5">
            <button onClick={handleAdd} className="btn-primary text-xs py-1 px-2.5 flex-1">Add</button>
            <button onClick={() => { setAdding(false); setLabel(""); setPath(""); }} className="btn-icon text-xs px-2">✕</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-1">
          <button
            onClick={() => setAdding(true)}
            className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-secondary hover:bg-bg-elevated transition-colors border border-dashed border-bg-border cursor-pointer"
          >
            <span className="text-sm leading-none">+</span>
            Add workspace…
          </button>
          <button
            onClick={handlePickFolder}
            className="btn-icon flex-shrink-0 border border-dashed border-bg-border"
            title="Browse folder"
          >
            <FolderOpen size={12} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Harness card ─────────────────────────────────────────────────────────────

function HarnessCard({
  harness,
  selected,
  taskCount,
  onClick,
}: {
  harness: Harness;
  selected: boolean;
  taskCount?: number;
  onClick: () => void;
}) {
  const score = harness.score ?? null;
  const scoreColor = score === null ? "text-text-muted"
    : score >= 0.8 ? "text-primary"
    : score >= 0.5 ? "text-warning"
    : "text-error";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150 group border ${
        selected
          ? "bg-primary/10 border-primary/25"
          : "border-transparent hover:bg-bg-elevated hover:border-bg-border"
      }`}
    >
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: harness.color }}
      />
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate ${selected ? "text-primary" : "text-text-secondary"}`}>
          {harness.name}
        </p>
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] text-text-muted truncate">{harness.domain}</p>
          {taskCount != null && taskCount > 0 && (
            <span className="text-[9px] font-mono text-text-muted opacity-70">{taskCount}t</span>
          )}
        </div>
      </div>
      {score !== null && (
        <span className={`text-[10px] font-mono tabular-nums flex-shrink-0 ${scoreColor}`}>
          {(score * 100).toFixed(0)}%
        </span>
      )}
    </button>
  );
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ passed, total, score }: { passed: number; total: number; score: number }) {
  const pct = total ? passed / total : 0;
  const scoreColor = score >= 0.8 ? "text-primary" : score >= 0.5 ? "text-warning" : "text-error";
  return (
    <div className="flex items-center gap-5 px-5 py-3 border-b border-bg-border bg-bg-surface flex-shrink-0">
      <div className="text-center min-w-[52px]">
        <p className="text-xl font-semibold font-mono text-text-primary tabular-nums">
          {passed}<span className="text-text-muted text-sm">/{total}</span>
        </p>
        <p className="text-[10px] text-text-muted uppercase tracking-wide mt-0.5">Passed</p>
      </div>
      <div className="flex-1 space-y-1">
        <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${pct * 100}%` }}
          />
        </div>
        <p className="text-[10px] text-text-muted">{(pct * 100).toFixed(0)}% pass rate</p>
      </div>
      <div className="text-center min-w-[52px]">
        <p className={`text-xl font-semibold font-mono tabular-nums ${scoreColor}`}>
          {(score * 100).toFixed(0)}<span className="text-sm">%</span>
        </p>
        <p className="text-[10px] text-text-muted uppercase tracking-wide mt-0.5">Avg Score</p>
      </div>
    </div>
  );
}

// ─── Task result panel ────────────────────────────────────────────────────────

const TRAJECTORY_STEP_COLORS: Record<string, string> = {
  setup_step:    "text-text-muted",
  teardown_step: "text-text-muted",
  tool_call:     "text-primary",
  tool_result:   "text-text-secondary",
  text_output:   "text-text-secondary",
  verify_step:   "text-warning",
};

const TRAJECTORY_STEP_ICONS: Record<string, string> = {
  setup_step:    "▶",
  teardown_step: "◀",
  tool_call:     "⚡",
  tool_result:   "↩",
  text_output:   "◎",
  verify_step:   "✓",
};

function TrajectoryView({ steps }: { steps: TrajectoryStep[] }) {
  return (
    <div className="space-y-0.5">
      {steps.map((s) => (
        <div key={s.seq} className={`flex items-start gap-2 font-mono text-[10px] leading-relaxed ${TRAJECTORY_STEP_COLORS[s.kind] ?? "text-text-muted"}`}>
          <span className="flex-shrink-0 w-3 text-center opacity-60">{TRAJECTORY_STEP_ICONS[s.kind] ?? "·"}</span>
          <span className="flex-shrink-0 opacity-50">{s.seq.toString().padStart(2, "0")}</span>
          <span className="font-medium">{s.label}</span>
          {s.duration_ms != null && s.duration_ms > 0 && (
            <span className="opacity-40 ml-auto flex-shrink-0">{s.duration_ms}ms</span>
          )}
          {s.error && <span className="text-error ml-1">⚠ {s.error.slice(0, 60)}</span>}
        </div>
      ))}
    </div>
  );
}

function AssertionsView({ results }: { results: AssertionResult[] }) {
  if (results.length === 0) return (
    <p className="text-[10px] text-text-muted italic">No assertions defined — score based on output containment</p>
  );
  const passed = results.filter((r) => r.passed).length;
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-text-muted mb-1.5">{passed}/{results.length} assertions passed</p>
      {results.map((r) => (
        <div key={r.id} className={`flex items-start gap-2 text-[10px] rounded px-2 py-1 ${r.passed ? "bg-primary/5" : "bg-error/5"}`}>
          <span className={`flex-shrink-0 font-mono ${r.passed ? "text-primary" : "text-error"}`}>
            {r.passed ? "✓" : "✗"}
          </span>
          <div className="min-w-0">
            <span className={r.passed ? "text-text-secondary" : "text-error/90"}>
              {r.label ?? r.kind}
            </span>
            {!r.passed && r.actual && (
              <p className="text-error/60 font-mono truncate">got: {r.actual}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskResultPanel({ result }: { result: RunTaskResult }) {
  const [tab, setTab] = useState<"output" | "trajectory" | "assertions">("output");
  const hasAssertions = (result.assertion_results?.length ?? 0) > 0;
  const hasTrajectory = (result.trajectory?.length ?? 0) > 0;
  const scoreColor = result.score >= 0.8 ? "text-primary" : result.score >= 0.5 ? "text-warning" : "text-error";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bg-border flex-shrink-0">
        <div className="flex items-center gap-0.5">
          {(["output", "trajectory", "assertions"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-2.5 py-1 rounded text-[10px] font-medium capitalize transition-colors cursor-pointer ${
                tab === t ? "bg-primary/10 text-primary" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {t}
              {t === "trajectory" && hasTrajectory && (
                <span className="ml-1 opacity-60">({result.trajectory!.length})</span>
              )}
              {t === "assertions" && hasAssertions && (
                <span className="ml-1 opacity-60">
                  ({result.assertion_results!.filter((a) => a.passed).length}/{result.assertion_results!.length})
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-text-muted font-mono">
          <span>{result.steps} tool calls</span>
          <span>{result.duration_ms}ms</span>
          <span className={`font-semibold ${scoreColor}`}>{(result.score * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3">
        {tab === "output" && (
          <div className="space-y-3">
            {result.violated_constraints.length > 0 && (
              <div className="bg-error/5 border border-error/20 rounded-lg px-3 py-2">
                <p className="text-[10px] text-error font-medium mb-1">Constraint violations:</p>
                {result.violated_constraints.map((c, i) => (
                  <p key={i} className="text-[10px] text-error/80 font-mono">• {c}</p>
                ))}
              </div>
            )}
            <div className="bg-bg-elevated rounded-lg p-3 font-mono text-xs text-text-secondary leading-relaxed whitespace-pre-wrap border border-bg-border">
              {result.output || "(empty output)"}
            </div>
          </div>
        )}
        {tab === "trajectory" && (
          <div className="bg-bg-elevated rounded-lg p-3 border border-bg-border">
            {hasTrajectory
              ? <TrajectoryView steps={result.trajectory!} />
              : <p className="text-[10px] text-text-muted italic">No trajectory recorded</p>
            }
          </div>
        )}
        {tab === "assertions" && (
          <AssertionsView results={result.assertion_results ?? []} />
        )}
      </div>
    </div>
  );
}

// ─── Mode tabs ────────────────────────────────────────────────────────────────

type Mode = "regulate" | "run";

// ─── Page ─────────────────────────────────────────────────────────────────────

export function EvolvePage() {
  const { config: agentConfig } = useAgentConfig();
  const [harnesses, setHarnesses] = useState<Harness[]>([]);
  const [selectedHarness, setSelectedHarness] = useState<Harness | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceConfig | null>(null);
  const [mode, setMode] = useState<Mode>("run");
  const [harnessTasks, setHarnessTasks] = useState<Task[]>([]);
  const [harnessTaskCounts, setHarnessTaskCounts] = useState<Record<string, number>>({});

  // Regulate mode state
  const [maxIter, setMaxIter] = useState(5);
  const [evolveState, setEvolveState] = useState<EvolveState>({
    status: "idle", harnessId: null, iteration: 0, maxIterations: 5,
    summary: null, regulatorMemory: null, lastDecision: null,
  });

  // Run Task mode state
  const [taskInstruction, setTaskInstruction] = useState("");
  const [taskRunning, setTaskRunning] = useState(false);
  const [taskResult, setTaskResult] = useState<RunTaskResult | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [streamingTools, setStreamingTools] = useState<string[]>([]);
  const taskOutputRef = useRef<HTMLDivElement>(null);

  // Agent console
  const { messages: chatMessages, sendMessage, status: chatStatus, stop: stopChat } = useChat({
    transport: new DefaultChatTransport({ api: "/api/acp/chat" }),
  });
  const [chatInput, setChatInput] = useState("");

  // Load harnesses — retry up to 3 times with backoff in case server is starting
  useEffect(() => {
    let cancelled = false;
    const load = async (attempt = 0) => {
      try {
        const r = await fetch("/api/harness");
        const d = await r.json();
        if (!cancelled && d.ok) {
          setHarnesses(d.data);
          // Pre-fetch task counts for all harnesses
          const counts: Record<string, number> = {};
          await Promise.all(
            (d.data as Harness[]).map(async (h: Harness) => {
              try {
                const tr = await fetch(`/api/harness/${h.id}/tasks`);
                const td = await tr.json();
                if (td.ok) counts[h.id] = td.data.length;
              } catch { /* ignore */ }
            })
          );
          if (!cancelled) setHarnessTaskCounts(counts);
        }
      } catch {
        if (!cancelled && attempt < 3) setTimeout(() => load(attempt + 1), 1000 * (attempt + 1));
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Load tasks when harness changes
  useEffect(() => {
    if (!selectedHarness) { setHarnessTasks([]); return; }
    fetch(`/api/harness/${selectedHarness.id}/tasks`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setHarnessTasks(d.data); })
      .catch(() => setHarnessTasks([]));
  }, [selectedHarness]);

  // Poll status while regulating
  useEffect(() => {
    if (evolveState.status !== "running") return;
    const id = setInterval(async () => {
      const res = await fetch("/api/evolve/status");
      const d = await res.json();
      if (d.ok) setEvolveState(d.data);
    }, 1000);
    return () => clearInterval(id);
  }, [evolveState.status]);

  // Scroll to task output
  useEffect(() => {
    taskOutputRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [taskResult]);

  // ── Regulate ───────────────────────────────────────────────────────────────

  const handleStartRegulate = useCallback(async () => {
    if (!selectedHarness) return;
    const res = await fetch("/api/evolve/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        harnessId: selectedHarness.id,
        maxIterations: maxIter,
        agentConfig,
        workspacePath: selectedWorkspace?.path,
      }),
    });
    const d = await res.json();
    if (d.ok) setEvolveState(d.data);
  }, [selectedHarness, maxIter, agentConfig, selectedWorkspace]);

  const handleStopRegulate = useCallback(async () => {
    await fetch("/api/evolve/stop", { method: "POST" });
    setEvolveState((s) => ({ ...s, status: "idle" }));
  }, []);

  // ── Run Task ───────────────────────────────────────────────────────────────

  const handleRunTask = useCallback(async () => {
    if (!selectedHarness || !taskInstruction.trim()) return;
    setTaskRunning(true);
    setTaskResult(null);
    setStreamingText("");
    setStreamingTools([]);

    try {
      const res = await fetch("/api/evolve/run-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          harnessId: selectedHarness.id,
          instruction: taskInstruction.trim(),
          workspacePath: selectedWorkspace?.path ?? "",
          agentConfig,
        }),
      });

      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({ error: "Unknown error" }));
        console.error("run-task error:", d);
        return;
      }

      // Parse SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // Process complete SSE lines
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "delta") {
              setStreamingText((t) => t + evt.text);
            } else if (evt.type === "tool") {
              setStreamingTools((tools) => [...tools, evt.name]);
            } else if (evt.type === "done") {
              setTaskResult({
                output: evt.output,
                steps: evt.steps,
                duration_ms: evt.duration_ms,
                tool_call_trace: evt.tool_call_trace ?? [],
                violated_constraints: evt.violated_constraints ?? [],
                trajectory: evt.trajectory ?? [],
                assertion_results: evt.assertion_results ?? [],
                score: evt.score ?? 1,
              });
            } else if (evt.type === "error") {
              console.error("run-task stream error:", evt.error);
            }
          } catch { /* malformed line */ }
        }
      }
    } finally {
      setTaskRunning(false);
    }
  }, [selectedHarness, taskInstruction, selectedWorkspace, agentConfig]);

  // ── Agent console ──────────────────────────────────────────────────────────

  const handleChatSend = useCallback(async () => {
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput("");
    await sendMessage(
      { parts: [{ type: "text", text }] },
      { body: { agent: agentConfig } },
    );
  }, [chatInput, sendMessage, agentConfig]);

  const isRegulating = evolveState.status === "running";
  const summary = evolveState.summary;
  const canRun = !!selectedHarness;

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left sidebar: harness + workspace ────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 flex flex-col border-r border-bg-border bg-bg-surface overflow-hidden">
        {/* Harness list */}
        <div className="px-3 pt-3 pb-2 flex-shrink-0">
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2">
            Harness
          </p>
          <div className="space-y-0.5">
            {harnesses.length === 0 && (
              <p className="text-[11px] text-text-muted px-2">No harnesses yet</p>
            )}
            {harnesses.map((h) => (
              <HarnessCard
                key={h.id}
                harness={h}
                selected={selectedHarness?.id === h.id}
                taskCount={harnessTaskCounts[h.id]}
                onClick={() => setSelectedHarness(selectedHarness?.id === h.id ? null : h)}
              />
            ))}
          </div>
        </div>

        <div className="border-t border-bg-border mx-3" />

        {/* Workspace list */}
        <div className="px-3 py-2 flex-1 overflow-y-auto">
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2">
            Workspace
          </p>
          <WorkspacePicker selected={selectedWorkspace} onSelect={setSelectedWorkspace} />
        </div>
      </aside>

      {/* ── Center: main content ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Score bar */}
        {summary && (
          <ScoreBar passed={summary.passed} total={summary.total} score={summary.avg_score} />
        )}

        {/* Mode tabs + controls */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-bg-border flex-shrink-0 flex-wrap">
          {/* Mode switcher */}
          <div className="flex items-center bg-bg-elevated rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setMode("run")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                mode === "run"
                  ? "bg-primary/15 text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <Zap size={11} strokeWidth={2} />
              Run Task
            </button>
            <button
              onClick={() => setMode("regulate")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                mode === "regulate"
                  ? "bg-primary/15 text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <FlaskConical size={11} strokeWidth={2} />
              Regulate
            </button>
          </div>

          <div className="h-4 w-px bg-bg-border" />

          {/* Context indicators */}
          {selectedHarness ? (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: selectedHarness.color }} />
              <span className="text-xs text-text-secondary font-medium">{selectedHarness.name}</span>
              <ChevronRight size={11} className="text-text-muted" />
            </div>
          ) : (
            <span className="text-xs text-text-muted italic">Select a harness →</span>
          )}
          {selectedWorkspace && (
            <div className="flex items-center gap-1.5">
              <FolderOpen size={11} className="text-text-muted" />
              <span className="text-xs text-text-muted">{selectedWorkspace.label}</span>
            </div>
          )}

          <div className="flex-1" />

          {/* Mode-specific controls */}
          {mode === "regulate" && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted whitespace-nowrap">Max iter</label>
              <input
                type="number"
                className="input w-14 text-center text-xs"
                value={maxIter}
                min={1} max={20}
                onChange={(e) => setMaxIter(parseInt(e.target.value) || 5)}
              />
              {isRegulating ? (
                <button onClick={handleStopRegulate} className="flex items-center gap-1.5 bg-error/10 hover:bg-error/20 text-error border border-error/20 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer">
                  <Square size={12} strokeWidth={2} />
                  Stop
                </button>
              ) : (
                <button
                  onClick={handleStartRegulate}
                  disabled={!canRun}
                  className="btn-primary text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RefreshCw size={12} strokeWidth={2} />
                  Run Regulation
                </button>
              )}
              {isRegulating && (
                <div className="flex items-center gap-1.5 text-xs text-text-muted">
                  <RefreshCw size={11} className="animate-spin" strokeWidth={2} />
                  Iter {evolveState.iteration}/{evolveState.maxIterations}
                </div>
              )}
              {evolveState.lastDecision && !isRegulating && (
                <div className="flex items-center gap-1.5 text-xs">
                  <GitBranch size={11} className="text-text-muted" />
                  <span className={`font-mono ${
                    evolveState.lastDecision.type === "ATTENUATE" ? "text-primary"
                    : evolveState.lastDecision.type === "EQUILIBRATE" ? "text-primary"
                    : "text-warning"
                  }`}>
                    {evolveState.lastDecision.type}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Main body split */}
        <div className="flex-1 flex overflow-hidden">

          {/* Content area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {mode === "run" ? (
              /* ── Run Task mode ── */
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Instruction input */}
                <div className="px-4 py-3 border-b border-bg-border flex-shrink-0">
                  <div className="flex items-start gap-2">
                    <textarea
                      className="input flex-1 text-xs font-mono resize-none"
                      rows={3}
                      placeholder={selectedHarness
                        ? `Instruction for ${selectedHarness.name}…\ne.g. "Refactor the auth module to use JWT"`
                        : "Select a harness first, then enter your instruction…"}
                      value={taskInstruction}
                      disabled={!canRun || taskRunning}
                      onChange={(e) => setTaskInstruction(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRunTask();
                      }}
                    />
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <button
                        onClick={handleRunTask}
                        disabled={!canRun || !taskInstruction.trim() || taskRunning}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed border"
                        style={{
                          backgroundColor: "color-mix(in srgb, var(--lf-primary) 10%, transparent)",
                          borderColor: "color-mix(in srgb, var(--lf-primary) 25%, transparent)",
                          color: "var(--lf-primary)",
                        }}
                      >
                        {taskRunning ? (
                          <Loader2 size={12} className="animate-spin" strokeWidth={2} />
                        ) : (
                          <Zap size={12} strokeWidth={2} />
                        )}
                        {taskRunning ? "Running…" : "Run"}
                      </button>
                      {taskResult && (
                        <button
                          onClick={() => { setTaskResult(null); setTaskInstruction(""); setStreamingText(""); setStreamingTools([]); }}
                          className="btn-icon w-7 h-7"
                          title="Clear"
                        >
                          <RotateCcw size={11} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-text-muted mt-1.5">
                    {selectedWorkspace
                      ? `Working in: ${selectedWorkspace.path}`
                      : "No workspace selected — agent will use server cwd"}
                    {" · "}⌘↵ to run
                  </p>
                </div>

                {/* Result */}
                <div className="flex-1 overflow-hidden" ref={taskOutputRef}>
                  {!taskResult && !taskRunning && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                      <div className="w-10 h-10 rounded-xl bg-bg-elevated flex items-center justify-center">
                        <Zap size={18} className="text-text-muted" strokeWidth={2} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-secondary">
                          {canRun ? "Ready to run" : "Select a harness"}
                        </p>
                        <p className="text-xs text-text-muted mt-1 max-w-xs">
                          {canRun
                            ? "Enter an instruction above and hit Run. The agent will execute it under the selected harness."
                            : "Pick a harness from the left panel, optionally choose a workspace, then enter your instruction."}
                        </p>
                      </div>
                    </div>
                  )}
                  {taskRunning && (
                    <div className="flex flex-col h-full overflow-hidden">
                      {/* Live tool call feed */}
                      {streamingTools.length > 0 && (
                        <div className="px-3 py-2 border-b border-bg-border flex-shrink-0 flex flex-wrap gap-1.5">
                          {streamingTools.map((t, i) => (
                            <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/8 text-primary border border-primary/15">
                              ⚡ {t}
                            </span>
                          ))}
                          <Loader2 size={11} className="text-text-muted animate-spin self-center" strokeWidth={2} />
                        </div>
                      )}
                      {/* Streaming text output */}
                      <div className="flex-1 overflow-y-auto p-3">
                        {streamingText ? (
                          <div className="bg-bg-elevated rounded-lg p-3 font-mono text-xs text-text-secondary leading-relaxed whitespace-pre-wrap border border-bg-border">
                            {streamingText}
                            <span className="inline-block w-1.5 h-3.5 bg-primary ml-0.5 animate-pulse align-text-bottom" />
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full gap-3">
                            <Loader2 size={22} className="text-primary animate-spin" strokeWidth={1.5} />
                            <p className="text-xs text-text-muted">Agent is starting…</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {taskResult && <TaskResultPanel result={taskResult} />}
                </div>
              </div>
            ) : (
              /* ── Regulate mode ── */
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Task list strip */}
                {harnessTasks.length > 0 && (
                  <div className="px-4 py-2 border-b border-bg-border flex-shrink-0">
                    <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-1.5">
                      Tasks ({harnessTasks.length})
                    </p>
                    <div className="space-y-1 max-h-28 overflow-y-auto">
                      {harnessTasks.map((t) => (
                        <div key={t.id} className="flex items-start gap-2 text-[10px]">
                          <span className="text-text-muted font-mono mt-0.5 flex-shrink-0">·</span>
                          <div className="min-w-0">
                            <span className="text-text-secondary font-medium">{t.name}</span>
                            {t.expectedOutput && (
                              <span className="ml-1.5 text-text-muted">→ expects "{t.expectedOutput}"</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {harnessTasks.length === 0 && selectedHarness && (
                  <div className="px-4 py-2 border-b border-bg-border flex-shrink-0">
                    <p className="text-[10px] text-warning font-medium">
                      No tasks — regulation loop will skip.
                    </p>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      Add tasks via <code className="font-mono">PUT /api/harness/{selectedHarness.id}/tasks</code>
                    </p>
                  </div>
                )}
                <div className="flex-1 min-h-0 p-4">
                  <Terminal />
                </div>
              </div>
            )}
          </div>

          {/* Agent console */}
          <div className="w-64 flex-shrink-0 flex flex-col border-l border-bg-border">
            <div className="flex items-center gap-2 px-3 h-10 border-b border-bg-border flex-shrink-0">
              <MessageSquare size={12} className="text-text-muted" strokeWidth={2} />
              <p className="text-xs font-medium text-text-secondary">Agent Console</p>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {chatMessages.length === 0 && (
                <p className="text-[11px] text-text-muted leading-relaxed">
                  Ask the agent to explain results, suggest improvements, or analyse failures…
                </p>
              )}
              {chatMessages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[90%] rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed font-mono ${
                    m.role === "user"
                      ? "bg-primary/10 text-text-primary"
                      : "bg-bg-elevated text-text-secondary"
                  }`}>
                    {(m.parts ?? []).map((p: any, i: number) =>
                      p.type === "text" ? <span key={i}>{p.text}</span> : null
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-3 py-2.5 border-t border-bg-border flex gap-1.5 flex-shrink-0">
              <input
                className="input flex-1 text-xs"
                placeholder="Ask the agent…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleChatSend()}
              />
              {chatStatus === "streaming" ? (
                <button onClick={stopChat} className="btn-icon" aria-label="Stop">
                  <Square size={11} strokeWidth={2} />
                </button>
              ) : (
                <button
                  onClick={handleChatSend}
                  disabled={!chatInput.trim()}
                  className="btn-primary px-2 py-1 disabled:opacity-40"
                  aria-label="Send"
                >
                  <Send size={11} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
