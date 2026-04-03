# Harness Regulation Loop

> **Version**: 2.0 · **Date**: 2026-04-03 · **Status**: Proposal

---

## Why Cybernetics

Cybernetics is a thinking framework about **information, feedback, and control** — not a set of formulas to implement literally.

We are not hardcoding PID gain matrices and having the regulator execute `Kp × e(t) + Ki × ∫e`. That is using AI to simulate a classical controller. The value runs the other way: the regulator already has language understanding, reasoning, and judgement. Our job is to give it complete information and room to act.

Two cybernetic principles shape the architecture:

> **Sensor completeness** — what the regulator can observe determines what it can fix.

> **Ashby's Law of Requisite Variety** — the regulator's action space must be at least as large as the disturbance space, or control fails.

Both point to the same root problem in the old loop: the regulator was **observation-starved** and **action-starved**.

---

## The Problem With the Old Loop

```
baseline → [rewrite prompt → benchmark → if passed++: keep] × N
```

The regulator received:

```typescript
`task ${r.task}: score=${r.score}, output="${r.stdout.slice(0, 100)}"`
//                                                          ^^^^^^^^^
//                                                          100-char sensor blind spot
```

**Missing observations:**

| What was missing | Consequence |
|------------------|-------------|
| Full task output | Cannot diagnose the actual disturbance source |
| Tool call trace | Cannot see where execution deviated |
| Actuation history | Repeats the same ineffective changes |
| Which tasks are stable | Cannot detect regressions |
| Prior attenuated directions | No memory of what has already been tried |

**Missing actions:** the regulator could only rewrite the entire system prompt. But disturbances are multi-dimensional — tool constraints, output format, domain gaps, conflicting task requirements. One action cannot cover the full disturbance space.

---

## Design

### Observation: `ErrorObservation`

Replaces `stdout.slice(0, 100)` with the full sensor output:

```typescript
interface ErrorObservation {
  task_id: string;
  task_instruction: string;
  expected_output?: string;
  full_output: string;
  tool_call_trace: ToolCallTrace[];
  steps_taken: number;
  duration_ms: number;
  output_diff?: string;
  violated_constraints: string[];
}
```

### Memory: `RegulatorMemory`

Persisted alongside the harness as `h-xxx.regulator.json`. Survives across sessions so the regulator accumulates experience rather than starting cold each run.

```typescript
interface RegulatorMemory {
  actuation_log: ActuationEntry[];    // full history of control actions + outcomes
  attenuated_signals: string[];       // directions already exhausted
  stable_states: string[];            // task IDs that must not regress
}
```

### Regulator prompt

The regulator receives: current system prompt, full actuation history, attenuated signals, stable states, and complete `ErrorObservation` per failing task. It then issues one of four decisions:

```
ATTENUATE   — targeted correction to the system prompt
BIFURCATE   — error space is irreconcilable; the task set needs two harnesses
EQUILIBRATE — remaining errors are outside this harness's scope; declare homeostasis
SATURATE    — all viable directions exhausted; human intervention needed
```

`BIFURCATE` is the critical addition. When two failure classes are structurally contradictory, the regulator should name it rather than oscillating forever.

### Homeostasis condition

Old acceptance rule: `if newSummary.passed > best.passed → keep`

Problem: passing 3 new tasks while breaking 2 stable ones nets `+1` and gets accepted.

New rule: **a committed actuation must increase passing count and must not destabilize any currently stable task.** If it does either, it is reverted and the destabilized task IDs are written back into the actuation log so the regulator sees them next iteration.

### Convergence

The regulator decides when it is done — via `EQUILIBRATE` (scope limit) or `SATURATE` (capability limit). External code only enforces hard limits: `maxIterations` (cost control) and `abortSignal` (user interrupt).

---

## Cybernetic principles → architecture

| Principle | Implementation |
|-----------|---------------|
| Sensor completeness | `ErrorObservation` carries full output + tool trace + violated constraints |
| Requisite variety | Regulator self-selects from ATTENUATE / BIFURCATE / EQUILIBRATE / SATURATE |
| Negative feedback stability | Homeostasis condition prevents actuation from destabilizing stable states |
| Second-order observation | `actuation_log` lets the regulator observe its own behavioural patterns |

---

## What was not adopted

**Numerical PID** — giving the regulator a number like `integral_error = 0.73` is less informative than telling it "this failure class has appeared in 4 consecutive iterations and each ATTENUATE only patched the symptom." Language carries more signal for a language model than scalar values.

**Population / Pareto evolution** — maintaining parallel harness variants is genuinely valuable but multiplies benchmark cost and requires storage and UI changes. Improving observation quality is higher priority at this stage.

**VSM five-layer hierarchy** — over-engineered for current scale; would turn a simple feedback loop into a framework to maintain.
