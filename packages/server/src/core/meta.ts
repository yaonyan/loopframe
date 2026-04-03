import { createACPProvider } from "@mcpc-tech/acp-ai-provider";
import { generateText } from "ai";
import type {
  BenchSummary,
  Harness,
  AgentConfig,
  RegulatorMemory,
  RegulationDecision,
  ErrorObservation,
} from "@loopframe/shared";
import { runBenchmark, buildErrorObservations } from "./runner.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ─── Regulator Memory persistence ───────────────────────────────────────────

function memoryPath(dataDir: string, harnessId: string): string {
  return join(dataDir, `${harnessId}.regulator.json`);
}

export function loadRegulatorMemory(dataDir: string, harnessId: string): RegulatorMemory {
  const p = memoryPath(dataDir, harnessId);
  if (existsSync(p)) {
    try { return JSON.parse(readFileSync(p, "utf-8")); } catch { /* fall through */ }
  }
  return {
    harness_id: harnessId,
    total_actuations: 0,
    last_regulated_at: new Date().toISOString(),
    actuation_log: [],
    attenuated_signals: [],
    stable_states: [],
  };
}

export function saveRegulatorMemory(dataDir: string, memory: RegulatorMemory): void {
  writeFileSync(memoryPath(dataDir, memory.harness_id), JSON.stringify(memory, null, 2));
}

// ─── Prompt builder ──────────────────────────────────────────────────────────

function buildRegulatorPrompt(
  harness: Harness,
  memory: RegulatorMemory,
  observations: ErrorObservation[],
  iteration: number,
): string {
  const actuationHistory = memory.actuation_log.length > 0
    ? memory.actuation_log.map((a) =>
        `- iter ${a.iteration}: "${a.actuation_description}" → score ${a.before_score}→${a.after_score} (${a.committed ? "committed" : "reverted"}${
          a.destabilized_states?.length
            ? `, destabilized: ${a.destabilized_states.join(", ")}`
            : ""
        })`
      ).join("\n")
    : "No prior actuations (first iteration)";

  const attenuated = memory.attenuated_signals.length > 0
    ? memory.attenuated_signals.join("\n")
    : "None yet";

  const stableStates = memory.stable_states.length > 0
    ? memory.stable_states.join(", ")
    : "None established yet";

  const observationText = observations.map((o) => {
    const failedAssertions = o.failed_assertions && o.failed_assertions.length > 0
      ? o.failed_assertions.map((a) => `  - [${a.kind}] ${a.label ?? a.id}: expected "${a.expected ?? ""}", got "${a.actual ?? ""}"`).join("\n")
      : "  (none — no deterministic assertions defined)";

    const trajSummary = o.trajectory_summary && o.trajectory_summary.length > 0
      ? o.trajectory_summary.slice(0, 20).join(" → ")
      : "(no trajectory)";

    return `
### Task: ${o.task_id}
Instruction: ${o.task_instruction}
Expected output: ${o.expected_output ?? "(no expected output — scored on quality)"}
Agent output:
${o.full_output}
Execution trajectory: ${trajSummary}
Violated constraints: ${o.violated_constraints.join(", ") || "none"}
Failed assertions:
${failedAssertions}
`;
  }).join("\n---\n");

  return `You are a regulator in a cybernetic loop. Your plant is a harness system prompt.
Goal: drive the harness toward homeostasis — all tasks passing, no stable states destabilized.

## Plant State: ${harness.name} (${harness.domain})
## Current System Prompt
\`\`\`
${harness.systemPrompt}
\`\`\`

## Actuation Log (your prior control actions)
${actuationHistory}

## Attenuated Signals (exhausted — do not re-attempt)
${attenuated}

## Stable States (must not be destabilized)
${stableStates}

## Current Error Observations (iteration ${iteration})
${observationText}

## Your Control Decision
Analyze the error observations. Review your actuation log — what patterns do you see?
Choose ONE regulation action:
- ATTENUATE: apply a targeted correction to the system prompt to reduce the observed error signal
- BIFURCATE: the error space is irreconcilable in one prompt — the task set needs two specialized harnesses
- EQUILIBRATE: the remaining errors are outside this harness's regulation scope — declare homeostasis
- SATURATE: all viable actuation directions are exhausted — signal for human intervention

If ATTENUATE: return the complete updated system prompt inside a \`\`\`text\`\`\` block, then on the next line write: ACTUATION: <one-line description of what you changed and why>
If BIFURCATE, EQUILIBRATE, or SATURATE: return your decision keyword followed by your reasoning.`;
}

// ─── Decision parser ─────────────────────────────────────────────────────────

function parseRegulationDecision(text: string): RegulationDecision | null {
  const promptMatch = text.match(/```(?:text)?\n([\s\S]+?)```/);
  if (promptMatch) {
    const system_prompt = promptMatch[1].trim();
    const actuationMatch = text.match(/ACTUATION:\s*(.+)/);
    return {
      type: "ATTENUATE",
      system_prompt,
      actuation_description: actuationMatch?.[1]?.trim() ?? "system prompt updated",
    };
  }
  const upper = text.toUpperCase();
  if (upper.includes("BIFURCATE")) return { type: "BIFURCATE", reasoning: text };
  if (upper.includes("EQUILIBRATE")) return { type: "EQUILIBRATE", reasoning: text };
  if (upper.includes("SATURATE")) return { type: "SATURATE", reasoning: text };
  return null;
}

// ─── Main regulation loop ────────────────────────────────────────────────────

export interface RegulationLoopOptions {
  harness: Harness;
  maxIterations: number;
  agentConfig: AgentConfig;
  dataDir: string;
  tasks?: Array<{ id: string; name: string; instruction: string; expectedOutput?: string }>;
  workspacePath?: string;
  abortSignal?: AbortSignal;
}

export interface RegulationLoopCallbacks {
  onIterationStart?: (iter: number) => void;
  onIterationDone?: (iter: number, summary: BenchSummary) => void;
  onDecision?: (decision: RegulationDecision) => void;
  onLog?: (msg: string) => void;
}

export async function runRegulationLoop(
  opts: RegulationLoopOptions,
  callbacks: RegulationLoopCallbacks = {},
): Promise<{ summary: BenchSummary | null; memory: RegulatorMemory }> {
  const {
    harness,
    maxIterations,
    agentConfig,
    dataDir,
    tasks = [],
    workspacePath,
    abortSignal,
  } = opts;
  const { onIterationStart, onIterationDone, onDecision, onLog } = callbacks;

  if (tasks.length === 0) {
    onLog?.("No tasks — skipping regulation loop");
    const memory = loadRegulatorMemory(dataDir, harness.id);
    return { summary: null, memory };
  }

  // Load persisted regulator memory
  const memory = loadRegulatorMemory(dataDir, harness.id);
  onLog?.(`Regulator memory loaded — ${memory.total_actuations} prior actuations, ${memory.stable_states.length} stable states`);

  let best: BenchSummary | null = null;
  let currentHarness = { ...harness };

  // Baseline
  onLog?.("Running baseline observation...");
  const baseline = await runBenchmark({ harness: currentHarness, tasks, agentConfig, workspacePath });
  best = baseline;
  onLog?.(`Baseline: ${baseline.passed}/${baseline.total} passed, avg_score=${baseline.avg_score}`);

  // Seed stable states from baseline
  const newlyStable = baseline.results
    .filter((r) => r.passed)
    .map((r) => r.task)
    .filter((id) => !memory.stable_states.includes(id));
  if (newlyStable.length > 0) {
    memory.stable_states.push(...newlyStable);
    onLog?.(`Stable states updated: ${memory.stable_states.join(", ")}`);
  }

  for (let iter = 1; iter <= maxIterations; iter++) {
    if (abortSignal?.aborted) {
      onLog?.("Regulation loop aborted by user");
      break;
    }

    onIterationStart?.(iter);

    if (best.passed === best.total) {
      onLog?.("All tasks in stable state — homeostasis reached");
      break;
    }

    const observations = buildErrorObservations(best, tasks);
    if (observations.length === 0) break;

    onLog?.(`Iter ${iter}: consulting regulator (${observations.length} error observations)...`);

    const provider = createACPProvider({
      command: agentConfig.command,
      args: agentConfig.args,
      session: { cwd: workspacePath ?? process.cwd(), mcpServers: [] },
      persistSession: false,
    } as any);

    let decision: RegulationDecision | null = null;

    try {
      const regulatorResult = await generateText({
        model: provider.languageModel(agentConfig.acpModel, agentConfig.acpMode),
        prompt: buildRegulatorPrompt(currentHarness, memory, observations, iter),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: provider.tools as any,
      });

      decision = parseRegulationDecision(regulatorResult.text);
    } finally {
      provider.cleanup();
    }

    if (!decision) {
      onLog?.(`Iter ${iter}: regulator returned unrecognised decision — skipping`);
      continue;
    }

    onDecision?.(decision);
    onLog?.(`Iter ${iter}: regulator decision → ${decision.type}`);

    // Terminal decisions — stop the loop
    if (decision.type === "EQUILIBRATE") {
      onLog?.(`Equilibrate declared: ${decision.reasoning.slice(0, 120)}`);
      break;
    }
    if (decision.type === "SATURATE") {
      onLog?.(`Regulator saturated — human intervention needed: ${decision.reasoning.slice(0, 120)}`);
      break;
    }
    if (decision.type === "BIFURCATE") {
      onLog?.(`Bifurcation suggested: ${decision.reasoning.slice(0, 120)}`);
      break;
    }

    // ATTENUATE — test the candidate prompt
    const candidate = { ...currentHarness, systemPrompt: decision.system_prompt };
    const newSummary = await runBenchmark({ harness: candidate, tasks, agentConfig, workspacePath });

    // Homeostasis check: must not destabilize previously stable states
    const destabilized = memory.stable_states.filter(
      (id) => !newSummary.results.find((r) => r.task === id && r.passed),
    );

    const entry = {
      iteration: iter,
      actuation_description: decision.actuation_description,
      before_score: best.avg_score,
      after_score: newSummary.avg_score,
      committed: false,
      destabilized_states: destabilized.length > 0 ? destabilized : undefined,
    };

    if (newSummary.passed > best.passed && destabilized.length === 0) {
      entry.committed = true;
      memory.actuation_log.push(entry);
      memory.total_actuations += 1;

      // Grow stable states
      newSummary.results
        .filter((r) => r.passed && !memory.stable_states.includes(r.task))
        .forEach((r) => memory.stable_states.push(r.task));

      best = newSummary;
      currentHarness = candidate;
      onLog?.(`Iter ${iter}: ✓ actuation committed (${newSummary.passed}/${newSummary.total})`);
    } else {
      memory.actuation_log.push(entry);
      memory.total_actuations += 1;
      // Record this as an attenuated signal so regulator avoids it
      memory.attenuated_signals.push(decision.actuation_description.slice(0, 80));
      onLog?.(
        destabilized.length > 0
          ? `Iter ${iter}: ✗ reverted — destabilized: ${destabilized.join(", ")}`
          : `Iter ${iter}: ✗ reverted — no homeostatic gain`,
      );
    }

    onIterationDone?.(iter, newSummary);
    saveRegulatorMemory(dataDir, memory);
  }

  memory.last_regulated_at = new Date().toISOString();
  saveRegulatorMemory(dataDir, memory);

  return { summary: best, memory };
}
