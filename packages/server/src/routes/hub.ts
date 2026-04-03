import { Hono } from "hono";
import { readFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { HubItem, Harness } from "@loopframe/shared";

const DATA_DIR = resolve(process.env.DATA_DIR ?? join(process.cwd(), "../../data/harnesses"));

// Built-in curated items (non-harness: tips and patterns only)
const BUILT_IN: HubItem[] = [
  {
    id: "builtin-data-analysis",
    type: "tip",
    title: "Data Analysis Pattern",
    description: "Strategy for structured data exploration and visualization tasks.",
    domain: "data-analysis",
    tags: ["python", "pandas", "visualization"],
    color: "#f59e0b",
    content: "Always start with df.info() and df.describe() before any analysis...",
    createdAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "builtin-regulation-loop",
    type: "pattern",
    title: "Harness Regulation Loop",
    description: "Cybernetic feedback pattern for iterative harness improvement via error observation.",
    domain: "regulation",
    tags: ["regulation", "benchmark", "regulator"],
    color: "#a78bfa",
    content: "Run benchmark → collect error observations → consult regulator for ATTENUATE/BIFURCATE/EQUILIBRATE/SATURATE decision → commit or revert.",
    createdAt: "2025-01-01T00:00:00Z",
  },
];

export const hubRoutes = new Hono();

hubRoutes.get("/", (c) => {
  mkdirSync(DATA_DIR, { recursive: true });

  // Convert saved harnesses to HubItems
  const saved: HubItem[] = existsSync(DATA_DIR)
    ? readdirSync(DATA_DIR)
        .filter((f) =>
          f.endsWith(".json") &&
          !f.endsWith(".tasks.json") &&
          !f.endsWith(".regulator.json")
        )
        .map((f) => {
          const h: Harness = JSON.parse(readFileSync(join(DATA_DIR, f), "utf-8"));
          return {
            id: h.id,
            type: "harness" as const,
            title: h.name,
            description: h.description,
            domain: h.domain,
            tags: h.tags,
            color: h.color,
            content: h.systemPrompt,
            createdAt: h.createdAt,
          };
        })
    : [];

  return c.json({ ok: true, data: [...BUILT_IN, ...saved] });
});
