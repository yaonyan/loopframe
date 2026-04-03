import type {
  BenchSummary,
  Harness,
  AgentConfig,
  TaskResult,
  ErrorObservation,
  TrajectoryStep,
} from "@loopframe/shared";
import { runAgent } from "./agent.js";
import {
  runSetup,
  runTeardown,
  evalAssertions,
  scoreAssertions,
} from "./scaffold.js";

export interface RunBenchmarkOptions {
  harness: Harness;
  tasks: Array<{ id: string; name: string; instruction: string; expectedOutput?: string }>;
  agentConfig: AgentConfig;
  concurrency?: number;
  timeoutMs?: number;
  workspacePath?: string;
}

// ─── Single task execution ────────────────────────────────────────────────────

export async function runTask(opts: {
  harness: Harness;
  task: { id: string; name: string; instruction: string; expectedOutput?: string };
  agentConfig: AgentConfig;
  workspacePath?: string;
  timeoutMs?: number;
  onTextDelta?: (delta: string) => void;
  onToolCall?: (name: string, args: unknown) => void;
}): Promise<TaskResult> {
  const {
    harness, task, agentConfig,
    workspacePath = process.cwd(), timeoutMs = 120_000,
    onTextDelta, onToolCall,
  } = opts;
  const t0 = Date.now();
  const trajectory: TrajectoryStep[] = [];

  // ── 1. Setup ───────────────────────────────────────────────────────────────
  try {
    runSetup(harness.setup ?? [], workspacePath, trajectory);
  } catch (err) {
    return {
      task: task.id,
      score: 0,
      passed: false,
      duration_ms: Date.now() - t0,
      stdout: "",
      stderr: "",
      error: `Setup failed: ${err}`,
      full_output: "",
      tool_call_trace: [],
      violated_constraints: [],
      trajectory,
      assertion_results: [],
    };
  }

  // ── 2. Agent run ───────────────────────────────────────────────────────────
  let agentResult: Awaited<ReturnType<typeof runAgent>> | null = null;
  let agentError: string | undefined;

  try {
    agentResult = await Promise.race([
      runAgent({
        harness, instruction: task.instruction, agentConfig, workspacePath, trajectory,
        onTextDelta, onToolCall,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs),
      ),
    ]);
  } catch (err) {
    agentError = String(err);
  }

  // ── 3. Verify ──────────────────────────────────────────────────────────────
  const assertionResults = evalAssertions(harness.verify ?? [], {
    agentOutput: agentResult?.text ?? "",
    workspacePath,
    toolCallTrace: agentResult?.tool_call_trace ?? [],
    trajectory,
  });

  // ── 4. Teardown ────────────────────────────────────────────────────────────
  runTeardown(harness.teardown ?? [], workspacePath, trajectory);

  // ── 5. Score ───────────────────────────────────────────────────────────────
  // Constraint violation heuristic (still used for regulator signal)
  const violated = checkConstraintHeuristic(agentResult?.text ?? "", harness.constraints ?? []);

  let score = agentError
    ? 0
    : scoreAssertions(harness.verify ?? [], assertionResults, agentResult?.text ?? "", task.expectedOutput);

  // Penalise constraint violations on top of assertion score
  if (violated.length > 0) {
    score = Math.max(0, score - violated.length * 0.15);
  }

  const passed = score >= 0.8;

  return {
    task: task.id,
    score,
    passed,
    duration_ms: Date.now() - t0,
    stdout: agentResult?.text ?? "",
    stderr: agentError ?? "",
    error: agentError,
    full_output: agentResult?.text ?? "",
    tool_call_trace: agentResult?.tool_call_trace ?? [],
    violated_constraints: violated,
    trajectory,
    assertion_results: assertionResults,
  };
}

// ─── Constraint heuristic (for regulator signal) ─────────────────────────────

function checkConstraintHeuristic(output: string, constraints: string[]): string[] {
  return constraints.filter((c) => {
    const lower = c.toLowerCase();
    if (lower.startsWith("never ")) {
      return output.toLowerCase().includes(lower.slice(6).trim());
    }
    return false;
  });
}

// ─── Benchmark ────────────────────────────────────────────────────────────────

export async function runBenchmark(opts: RunBenchmarkOptions): Promise<BenchSummary> {
  const { harness, tasks, agentConfig, concurrency = 2, timeoutMs = 120_000, workspacePath } = opts;

  const results: TaskResult[] = [];
  const queue = [...tasks];

  async function worker() {
    while (queue.length > 0) {
      const task = queue.shift()!;
      const result = await runTask({ harness, task, agentConfig, workspacePath, timeoutMs });
      results.push(result);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const avg_score = total > 0 ? results.reduce((s, r) => s + r.score, 0) / total : 0;

  return {
    harnessId: harness.id,
    passed,
    total,
    avg_score: Math.round(avg_score * 1000) / 1000,
    duration_ms: 0,
    results,
    startedAt: new Date().toISOString(),
  };
}

// ─── Error observation builder ────────────────────────────────────────────────

export function buildErrorObservations(
  summary: BenchSummary,
  tasks: Array<{ id: string; name: string; instruction: string; expectedOutput?: string }>,
): ErrorObservation[] {
  return summary.results
    .filter((r) => !r.passed)
    .map((r) => {
      const task = tasks.find((t) => t.id === r.task);
      return {
        task_id: r.task,
        task_instruction: task?.instruction ?? r.task,
        expected_output: task?.expectedOutput,
        full_output: r.full_output ?? r.stdout,
        tool_call_trace: r.tool_call_trace ?? [],
        steps_taken: r.trajectory?.filter((s) => s.kind === "tool_call").length ?? 0,
        duration_ms: r.duration_ms,
        violated_constraints: r.violated_constraints ?? [],
        failed_assertions: r.assertion_results?.filter((a) => !a.passed),
        trajectory_summary: r.trajectory?.map((s) => `${s.kind}:${s.label}`),
      } satisfies ErrorObservation;
    });
}
