import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { acpRoutes } from "./routes/acp.js";
import { harnessRoutes } from "./routes/harness.js";
import { evolveRoutes } from "./routes/evolve.js";
import { hubRoutes } from "./routes/hub.js";

export const app = new Hono();

app.use("*", cors({ origin: ["http://localhost:3000", "http://localhost:3001"] }));
app.use("*", logger());

app.route("/api/acp", acpRoutes);
app.route("/api/harness", harnessRoutes);
app.route("/api/evolve", evolveRoutes);
app.route("/api/hub", hubRoutes);

app.get("/health", (c) => c.json({ ok: true }));
