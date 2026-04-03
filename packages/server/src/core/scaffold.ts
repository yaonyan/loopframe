import { execSync, execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type {
  HarnessStep,
  HarnessAssertion,
  AssertionResult,
  TrajectoryStep,
  ToolCallTrace,
} from "@loopframe/shared";

// ─── Step execution ──────────────────────────────────────────────────────────

export function runStep(
  step: HarnessStep,
  workspacePath: string,
  trajectory: TrajectoryStep[],
): void {
  const t0 = Date.now();
  const seq = trajectory.length;

  const push = (output?: string, error?: string) =>
    trajectory.push({
      seq,
      kind: "setup_step",
      ts: t0,
      label: step.label ?? `${step.kind}:${step.id}`,
      input: step,
      output,
      error,
      duration_ms: Date.now() - t0,
    });

  try {
    switch (step.kind) {
      case "shell": {
        if (!step.command) throw new Error("shell step missing command");
        const out = execSync(step.command, {
          cwd: workspacePath,
          encoding: "utf-8",
          timeout: 30_000,
        });
        push(out);
        break;
      }
      case "file_write": {
        if (!step.path) throw new Error("file_write step missing path");
        const abs = join(workspacePath, step.path);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, step.content ?? "");
        push(`wrote ${step.path}`);
        break;
      }
      case "file_delete": {
        if (!step.path) throw new Error("file_delete step missing path");
        const abs = join(workspacePath, step.path);
        if (existsSync(abs)) unlinkSync(abs);
        push(`deleted ${step.path}`);
        break;
      }
      case "git_reset": {
        const ref = step.ref ?? "HEAD";
        execSync(`git checkout ${ref} -- .`, {
          cwd: workspacePath,
          encoding: "utf-8",
          timeout: 15_000,
        });
        push(`reset to ${ref}`);
        break;
      }
      case "env_set": {
        // env vars are applied at agent spawn time via process.env merging
        // just record them here; agent.ts reads step.env via RunAgentOptions
        push(`env vars noted: ${Object.keys(step.env ?? {}).join(", ")}`);
        break;
      }
    }
  } catch (err) {
    push(undefined, String(err));
    throw err; // setup failures abort the run
  }
}

export function runSetup(
  steps: HarnessStep[],
  workspacePath: string,
  trajectory: TrajectoryStep[],
): void {
  for (const step of steps) {
    // Override kind label for teardown reuse
    runStep(step, workspacePath, trajectory);
  }
}

export function runTeardown(
  steps: HarnessStep[],
  workspacePath: string,
  trajectory: TrajectoryStep[],
): void {
  for (const step of steps) {
    const t0 = Date.now();
    try {
      runStep(step, workspacePath, trajectory);
    } catch {
      // teardown failures are logged but do not affect score
      trajectory.push({
        seq: trajectory.length,
        kind: "teardown_step",
        ts: t0,
        label: `teardown:${step.id}`,
        error: "teardown step failed (non-fatal)",
        duration_ms: Date.now() - t0,
      });
    }
  }
}

// ─── Assertion evaluation ────────────────────────────────────────────────────

export function evalAssertions(
  assertions: HarnessAssertion[],
  opts: {
    agentOutput: string;
    workspacePath: string;
    toolCallTrace: ToolCallTrace[];
    trajectory: TrajectoryStep[];
  },
): AssertionResult[] {
  const { agentOutput, workspacePath, toolCallTrace, trajectory } = opts;
  const results: AssertionResult[] = [];

  for (const a of assertions) {
    const t0 = Date.now();
    let passed = false;
    let actual: string | undefined;
    let error: string | undefined;

    try {
      switch (a.kind) {
        case "output_contains":
          passed = agentOutput.includes(a.value ?? "");
          actual = agentOutput.slice(0, 200);
          break;

        case "output_not_contains":
          passed = !agentOutput.includes(a.value ?? "");
          actual = agentOutput.slice(0, 200);
          break;

        case "file_exists": {
          const abs = join(workspacePath, a.path ?? "");
          passed = existsSync(abs);
          actual = passed ? "exists" : "not found";
          break;
        }

        case "file_not_exists": {
          const abs = join(workspacePath, a.path ?? "");
          passed = !existsSync(abs);
          actual = passed ? "not found" : "exists";
          break;
        }

        case "file_contains": {
          const abs = join(workspacePath, a.path ?? "");
          if (!existsSync(abs)) {
            passed = false;
            actual = "file not found";
          } else {
            const content = readFileSync(abs, "utf-8");
            passed = content.includes(a.value ?? "");
            actual = content.slice(0, 200);
          }
          break;
        }

        case "command_output": {
          if (!a.command) throw new Error("command_output assertion missing command");
          const out = execSync(a.command, {
            cwd: workspacePath,
            encoding: "utf-8",
            timeout: 15_000,
          });
          passed = out.includes(a.value ?? "");
          actual = out.slice(0, 200);
          break;
        }

        case "tool_was_called":
          passed = toolCallTrace.some((t) => t.tool === a.tool);
          actual = toolCallTrace.map((t) => t.tool).join(", ") || "(none)";
          break;

        case "tool_not_called":
          passed = !toolCallTrace.some((t) => t.tool === a.tool);
          actual = toolCallTrace.map((t) => t.tool).join(", ") || "(none)";
          break;
      }
    } catch (err) {
      passed = false;
      error = String(err);
    }

    trajectory.push({
      seq: trajectory.length,
      kind: "verify_step",
      ts: t0,
      label: a.label ?? `${a.kind}:${a.id}`,
      input: { kind: a.kind, value: a.value, path: a.path, tool: a.tool },
      output: passed ? "✓ pass" : `✗ fail${error ? `: ${error}` : ""}`,
      duration_ms: Date.now() - t0,
    });

    results.push({ id: a.id, kind: a.kind, label: a.label, passed, actual, expected: a.value, error });
  }

  return results;
}

/** Compute a weighted score from assertion results (0–1) */
export function scoreAssertions(
  assertions: HarnessAssertion[],
  results: AssertionResult[],
  fallbackOutput: string,
  expectedOutput?: string,
): number {
  if (assertions.length === 0) {
    // No assertions: fall back to output containment check
    if (expectedOutput) {
      return fallbackOutput.includes(expectedOutput) ? 1.0 : 0.0;
    }
    return 1.0; // no criteria = full score
  }

  const totalWeight = assertions.reduce((s, a) => s + (a.weight ?? 1), 0);
  const earnedWeight = results.reduce((s, r) => {
    const a = assertions.find((x) => x.id === r.id);
    return s + (r.passed ? (a?.weight ?? 1) : 0);
  }, 0);

  return totalWeight > 0 ? earnedWeight / totalWeight : 0;
}

/** Collect env vars from env_set steps */
export function collectEnvFromSteps(steps: HarnessStep[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const s of steps) {
    if (s.kind === "env_set" && s.env) Object.assign(env, s.env);
  }
  return env;
}

/** Inject tool allowlist + constraints into system prompt */
export function buildSystemPrompt(
  base: string,
  tools: string[],
  constraints: string[],
): string {
  const parts: string[] = [base.trim()];

  if (tools.length > 0) {
    parts.push(
      `\n\n## Allowed tools\nYou may ONLY use the following tools. Do not call any tool not on this list:\n${tools.map((t) => `- ${t}`).join("\n")}`,
    );
  }

  if (constraints.length > 0) {
    parts.push(
      `\n\n## Constraints\nYou MUST follow all of these rules at all times:\n${constraints.map((c) => `- ${c}`).join("\n")}`,
    );
  }

  return parts.join("");
}
