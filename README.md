# Loopframe

**Harness Regulation Studio** — run agents under structured harnesses, observe their behaviour, and let a cybernetic regulation loop improve them automatically.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## What it is

Loopframe treats agent harnesses as **plants in a feedback loop**:

```
Harness (plant)  →  Agent run  →  Benchmark (sensor)
      ↑                                    ↓
  ATTENUATE ←──── Regulator  ←──── Error observations
```

A **harness** is not just a system prompt — it is a full execution scaffold:

| Phase | What happens |
|-------|-------------|
| `setup` | Deterministic environment preparation (shell commands, file writes, git reset) |
| `agent` | ACP-compatible agent runs under the system prompt with tool allowlist + constraints |
| `verify` | Deterministic assertions (file exists, output contains, command output, tool was called…) |
| `teardown` | Environment cleanup |

The **regulation loop** (inspired by Ashby's Law of Requisite Variety) runs the harness against a task set, collects structured error observations, and consults a regulator that issues one of four decisions:

- **ATTENUATE** — targeted correction to the system prompt
- **BIFURCATE** — task set needs two specialised harnesses
- **EQUILIBRATE** — remaining errors are out of scope; declare homeostasis  
- **SATURATE** — all directions exhausted; signal for human intervention

Regulator state (`RegulatorMemory`) persists across sessions so the loop accumulates experience rather than starting cold each run.

---

## Features

- **Run Task** — select a harness + workspace, enter an instruction, watch the agent stream in real time (text deltas + tool call badges)
- **Regulate** — run the full regulation loop against a task set; terminal shows live iteration progress
- **Trajectory viewer** — every step from `setup_step` → `tool_call` → `verify_step` → `text_output`
- **Assertion breakdown** — per-assertion pass/fail with actual vs expected values
- **Hub** — browse harness templates and patterns
- **Forge** — collaborate with an AI agent to build new harnesses

---

## Stack

| Layer | Tech |
|-------|------|
| Agent protocol | [ACP](https://agentclientprotocol.org) via `@mcpc-tech/acp-ai-provider` |
| Compatible agents | CodeBuddy, Claude Code, Gemini CLI, Codex CLI |
| Server | Hono + Node.js, WebSocket for live events |
| Client | React 19, Vite, Tailwind CSS |
| Monorepo | pnpm workspaces |

---

## Quick start

```bash
# Install dependencies
pnpm install

# Start dev server (client :3000, server :3001)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

In **Settings**, select your ACP agent (CodeBuddy, Claude Code, Gemini CLI, or custom).

---

## Project structure

```
packages/
  client/          # React frontend
  server/
    src/
      core/
        agent.ts   # ACP agent runner (streamText + onTextDelta streaming)
        runner.ts  # setup → agent → verify → teardown orchestration
        scaffold.ts # deterministic step execution + assertion evaluation
        meta.ts    # runRegulationLoop — cybernetic regulation loop
      routes/
        evolve.ts  # /run-task (SSE), /start, /stop, /benchmark
        harness.ts # CRUD + /tasks endpoints
        hub.ts     # curated hub items
  shared/          # shared TypeScript types
data/
  harnesses/       # harness JSON + *.tasks.json + *.regulator.json
docs/
  harness-regulation-loop.md
```

---

## Harness format

```jsonc
{
  "id": "h-my-harness",
  "name": "My Harness",
  "domain": "frontend-dev",
  "systemPrompt": "You are a ...",
  "tools": ["read_file", "write_file"],     // injected into system prompt as allowlist
  "constraints": ["Never delete files ..."], // injected into system prompt
  "setup": [                                 // deterministic, runs before agent
    { "id": "s1", "kind": "shell", "command": "git checkout HEAD -- ." }
  ],
  "verify": [                                // deterministic assertions, scored
    { "id": "v1", "kind": "file_exists", "path": "output.md" },
    { "id": "v2", "kind": "output_contains", "value": "## Summary" }
  ],
  "teardown": []
}
```

Tasks live in `h-{id}.tasks.json`:

```jsonc
[
  {
    "id": "t1",
    "name": "Explain the router",
    "instruction": "Look at src/App.tsx and tell me which routing library is used.",
    "expectedOutput": "react-router"
  }
]
```

---

## Regulation decisions

| Decision | When | Effect |
|----------|------|--------|
| `ATTENUATE` | Regulator finds a targeted fix | System prompt patched; benchmark re-run; committed only if no stable states destabilised |
| `BIFURCATE` | Task set is irreconcilable in one prompt | Regulator signals split; human creates two specialised harnesses |
| `EQUILIBRATE` | Remaining errors are out of harness scope | Loop stops; current state declared as homeostasis |
| `SATURATE` | All viable directions exhausted | Loop stops; human intervention requested |

---

## License

MIT — see [LICENSE](LICENSE).
