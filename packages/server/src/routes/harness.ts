import { Hono } from "hono";
import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Harness, Task } from "@loopframe/shared";

const DATA_DIR = resolve(process.env.DATA_DIR ?? join(process.cwd(), "../../data/harnesses"));

function ensureDir() {
  mkdirSync(DATA_DIR, { recursive: true });
}

function listAll(): Harness[] {
  ensureDir();
  return readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".tasks.json") && !f.endsWith(".regulator.json"))
    .map((f) => JSON.parse(readFileSync(join(DATA_DIR, f), "utf-8")) as Harness);
}

function getOne(id: string): Harness | null {
  const p = join(DATA_DIR, `${id}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8"));
}

function saveOne(h: Harness) {
  ensureDir();
  writeFileSync(join(DATA_DIR, `${h.id}.json`), JSON.stringify(h, null, 2));
}

function getTasks(id: string): Task[] {
  const p = join(DATA_DIR, `${id}.tasks.json`);
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, "utf-8"));
}

function saveTasks(id: string, tasks: Task[]) {
  ensureDir();
  writeFileSync(join(DATA_DIR, `${id}.tasks.json`), JSON.stringify(tasks, null, 2));
}

export const harnessRoutes = new Hono();

harnessRoutes.get("/", (c) => c.json({ ok: true, data: listAll() }));

harnessRoutes.get("/:id", (c) => {
  const h = getOne(c.req.param("id"));
  if (!h) return c.json({ ok: false, error: "Not found" }, 404);
  return c.json({ ok: true, data: h });
});

harnessRoutes.get("/:id/tasks", (c) => {
  const h = getOne(c.req.param("id"));
  if (!h) return c.json({ ok: false, error: "Not found" }, 404);
  return c.json({ ok: true, data: getTasks(c.req.param("id")) });
});

harnessRoutes.put("/:id/tasks", async (c) => {
  const h = getOne(c.req.param("id"));
  if (!h) return c.json({ ok: false, error: "Not found" }, 404);
  const tasks = await c.req.json() as Task[];
  saveTasks(c.req.param("id"), tasks);
  return c.json({ ok: true, data: tasks });
});

harnessRoutes.post("/", async (c) => {
  const body = await c.req.json() as Partial<Harness>;
  const now = new Date().toISOString();
  const h: Harness = {
    id: body.id ?? `h-${Date.now()}`,
    name: body.name ?? "Untitled",
    domain: body.domain ?? "general",
    description: body.description ?? "",
    systemPrompt: body.systemPrompt ?? "",
    tools: body.tools ?? [],
    constraints: body.constraints ?? [],
    setup: body.setup ?? [],
    verify: body.verify ?? [],
    teardown: body.teardown ?? [],
    tags: body.tags ?? [],
    color: body.color ?? "#22c55e",
    createdAt: body.createdAt ?? now,
    updatedAt: now,
    version: (body.version ?? 0) + 1,
    score: body.score,
    evolveCount: body.evolveCount ?? 0,
  };
  saveOne(h);
  return c.json({ ok: true, data: h });
});

harnessRoutes.put("/:id", async (c) => {
  const existing = getOne(c.req.param("id"));
  if (!existing) return c.json({ ok: false, error: "Not found" }, 404);
  const body = await c.req.json() as Partial<Harness>;
  const h: Harness = {
    ...existing,
    ...body,
    id: existing.id,
    updatedAt: new Date().toISOString(),
    version: existing.version + 1,
  };
  saveOne(h);
  return c.json({ ok: true, data: h });
});

harnessRoutes.delete("/:id", (c) => {
  const p = join(DATA_DIR, `${c.req.param("id")}.json`);
  if (!existsSync(p)) return c.json({ ok: false, error: "Not found" }, 404);
  unlinkSync(p);
  return c.json({ ok: true, data: null });
});
