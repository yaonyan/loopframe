import { Hono } from "hono";
import type {
  EvolveState,
  BenchSummary,
  Harness,
  RegulatorMemory,
  RegulationDecision,
  RunTaskRequest,
} from "@loopframe/shared";
import { broadcast } from "../ws.js";
import { runBenchmark, runTask } from "../core/runner.js";
import { runRegulationLoop, loadRegulatorMemory } from "../core/meta.js";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DATA_DIR = resolve(process.env.DATA_DIR ?? join(process.cwd(), "../../data/harnesses"));

let evolveState: EvolveState = {
  status: "idle",
  harnessId: null,
  iteration: 0,
  maxIterations: 5,
  summary: null,
  regulatorMemory: null,
  lastDecision: null,
};

let abortController: AbortController | null = null;

export const evolveRoutes = new Hono();

// ─── Status ─────────────────────────────────────────────────────────────────

evolveRoutes.get("/status", (c) => c.json({ ok: true, data: evolveState }));

evolveRoutes.get("/memory/:harnessId", (c) => {
  const memory = loadRegulatorMemory(DATA_DIR, c.req.param("harnessId"));
  return c.json({ ok: true, data: memory });
});

// ─── Start regulation loop ───────────────────────────────────────────────────

evolveRoutes.post("/start", async (c) => {
  if (evolveState.status === "running") {
    return c.json({ ok: false, error: "Already running" }, 400);
  }

  const body = await c.req.json();
  const {
    harnessId,
    maxIterations = 5,
    agentConfig,
    workspacePath,
    tasks: tasksFromBody,
  } = body;

  const harnessPath = join(DATA_DIR, `${harnessId}.json`);
  if (!existsSync(harnessPath)) {
    return c.json({ ok: false, error: "Harness not found" }, 404);
  }

  const harness: Harness = JSON.parse(readFileSync(harnessPath, "utf-8"));

  // Load tasks: from request body, or auto-load h-xxx.tasks.json
  const tasksPath = join(DATA_DIR, `${harnessId}.tasks.json`);
  const tasks: Array<{ id: string; name: string; instruction: string; expectedOutput?: string }> =
    Array.isArray(tasksFromBody) && tasksFromBody.length > 0
      ? tasksFromBody
      : existsSync(tasksPath)
        ? JSON.parse(readFileSync(tasksPath, "utf-8"))
        : [];

  abortController = new AbortController();
  evolveState = {
    status: "running",
    harnessId,
    iteration: 0,
    maxIterations,
    summary: null,
    regulatorMemory: null,
    lastDecision: null,
  };

  broadcast({
    type: "regulation:start",
    payload: { harnessId, maxIterations, taskCount: tasks.length },
    ts: Date.now(),
  });

  // Run in background
  runRegulationLoop(
    {
      harness,
      maxIterations,
      agentConfig,
      dataDir: DATA_DIR,
      tasks,
      workspacePath,
      abortSignal: abortController.signal,
    },
    {
      onIterationStart: (iter) => {
        evolveState.iteration = iter;
        broadcast({ type: "regulation:actuate", payload: { iteration: iter }, ts: Date.now() });
      },
      onIterationDone: (iter, summary: BenchSummary) => {
        evolveState.summary = summary;
        broadcast({ type: "evolve:task-done", payload: { iteration: iter, summary }, ts: Date.now() });
      },
      onDecision: (decision: RegulationDecision) => {
        evolveState.lastDecision = decision;
        broadcast({ type: "regulation:decision", payload: { decision }, ts: Date.now() });
      },
      onLog: (msg) => broadcast({ type: "log", payload: { msg }, ts: Date.now() }),
    },
  ).then(({ summary: finalSummary, memory }) => {
    evolveState = {
      ...evolveState,
      status: "done",
      summary: finalSummary,
      regulatorMemory: memory,
    };
    // Persist score back to harness file
    if (finalSummary) {
      const h: Harness = JSON.parse(readFileSync(harnessPath, "utf-8"));
      h.score = finalSummary.avg_score;
      h.evolveCount += 1;
      writeFileSync(harnessPath, JSON.stringify(h, null, 2));
    }
    broadcast({ type: "regulation:done", payload: evolveState, ts: Date.now() });
  }).catch((err) => {
    evolveState = { ...evolveState, status: "error", error: String(err) };
    broadcast({ type: "regulation:error", payload: { error: String(err) }, ts: Date.now() });
  });

  return c.json({ ok: true, data: evolveState });
});

// ─── Stop ────────────────────────────────────────────────────────────────────

evolveRoutes.post("/stop", (c) => {
  if (abortController && !abortController.signal.aborted) {
    abortController.abort();
  }
  evolveState = { ...evolveState, status: "idle" };
  return c.json({ ok: true, data: evolveState });
});

// ─── Run Task streaming — SSE: text deltas + tool calls in real time ─────────
//
// Streams three event types:
//   data: {"type":"delta","text":"..."}\n\n
//   data: {"type":"tool","name":"...","args":{...}}\n\n
//   data: {"type":"done","output":"...","score":1,"trajectory":[...],...}\n\n
//   data: {"type":"error","error":"..."}\n\n

evolveRoutes.post("/run-task", async (c) => {
  const body = await c.req.json() as RunTaskRequest;
  const { harnessId, instruction, agentConfig } = body;
  const workspacePath = body.workspacePath || process.cwd();

  const harnessPath = join(DATA_DIR, `${harnessId}.json`);
  if (!existsSync(harnessPath)) {
    return c.json({ ok: false, error: "Harness not found" }, 404);
  }

  const harness: Harness = JSON.parse(readFileSync(harnessPath, "utf-8"));

  broadcast({
    type: "task:start",
    payload: { harnessId, instruction: instruction.slice(0, 80) },
    ts: Date.now(),
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      try {
        const result = await runTask({
          harness,
          task: { id: "run-task", name: instruction.slice(0, 40), instruction },
          agentConfig,
          workspacePath,
          onTextDelta: (delta) => send({ type: "delta", text: delta }),
          onToolCall: (name, args) => send({ type: "tool", name, args }),
        });

        broadcast({
          type: "task:done",
          payload: {
            harnessId,
            steps: result.tool_call_trace?.length ?? 0,
            duration_ms: result.duration_ms,
            score: result.score,
            passed: result.passed,
          },
          ts: Date.now(),
        });

        send({
          type: "done",
          output: result.stdout,
          steps: result.tool_call_trace?.length ?? 0,
          duration_ms: result.duration_ms,
          tool_call_trace: result.tool_call_trace ?? [],
          violated_constraints: result.violated_constraints ?? [],
          trajectory: result.trajectory ?? [],
          assertion_results: result.assertion_results ?? [],
          score: result.score,
        });
      } catch (err) {
        broadcast({ type: "task:error", payload: { error: String(err) }, ts: Date.now() });
        send({ type: "error", error: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
});

// ─── Benchmark only (no regulation) ─────────────────────────────────────────

evolveRoutes.post("/benchmark", async (c) => {
  const { harnessId, tasks, agentConfig, workspacePath } = await c.req.json();

  const harnessPath = join(DATA_DIR, `${harnessId}.json`);
  if (!existsSync(harnessPath)) {
    return c.json({ ok: false, error: "Harness not found" }, 404);
  }

  const harness: Harness = JSON.parse(readFileSync(harnessPath, "utf-8"));

  try {
    const summary = await runBenchmark({ harness, tasks, agentConfig, workspacePath });
    return c.json({ ok: true, data: summary });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500);
  }
});
