import { Hono } from "hono";
import { streamText, convertToModelMessages } from "ai";
import { createACPProvider } from "@mcpc-tech/acp-ai-provider";
import { z } from "zod";

// planEntrySchema — optional, graceful fallback
let planEntrySchema: z.ZodTypeAny = z.unknown();
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sdk = require("@agentclientprotocol/sdk");
  if (sdk.planEntrySchema) planEntrySchema = sdk.planEntrySchema;
} catch { /* not available */ }

type ACPProvider = ReturnType<typeof createACPProvider>;

interface ProviderEntry {
  provider: ACPProvider;
  createdAt: number;
}

const sessionProviders = new Map<string, ProviderEntry>();

function genSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const acpRoutes = new Hono();

// POST /api/acp/init-session
acpRoutes.post("/init-session", async (c) => {
  try {
    const { agent, envVars = {} } = await c.req.json();

    const provider = createACPProvider({
      command: agent.command,
      args: agent.args ?? [],
      env: { ...process.env, ...envVars },
      session: { cwd: process.cwd(), mcpServers: [] },
      authMethodId: agent.authMethodId,
    });

    await provider.initSession();

    // v0.3.0: use getSessionId()
    const sessionId = provider.getSessionId() ?? genSessionId();
    sessionProviders.set(sessionId, { provider, createdAt: Date.now() });

    console.log(`[acp] session initialized: ${sessionId}`);
    return c.json({ sessionId });
  } catch (err) {
    console.error("[acp] init-session error:", err);
    return c.json({ error: err instanceof Error ? err.message : "Internal Server Error" }, 500);
  }
});

// POST /api/acp/cleanup-session
acpRoutes.post("/cleanup-session", async (c) => {
  try {
    const { sessionId } = await c.req.json();
    const entry = sessionProviders.get(sessionId);
    if (entry) {
      entry.provider.cleanup();
      sessionProviders.delete(sessionId);
      console.log(`[acp] session cleaned up: ${sessionId}`);
    }
    return c.json({ success: true });
  } catch (err) {
    console.error("[acp] cleanup-session error:", err);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// POST /api/acp/chat  →  SSE stream
acpRoutes.post("/chat", async (c) => {
  const body = await c.req.json();
  const { messages, sessionId, agent, envVars = {} } = body;

  let provider: ACPProvider;
  let shouldCleanup = true;

  const existing = sessionId ? sessionProviders.get(sessionId) : undefined;
  if (existing) {
    provider = existing.provider;
    shouldCleanup = false;
  } else {
    provider = createACPProvider({
      command: agent.command,
      args: agent.args ?? [],
      env: { ...process.env, ...envVars },
      session: { cwd: process.cwd(), mcpServers: [] },
      authMethodId: agent.authMethodId,
    });
    await provider.initSession();
  }

  const model = agent?.acpModel;
  const mode = agent?.acpMode;
  const abortController = new AbortController();

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          const modelMessages = await convertToModelMessages(messages);

          const result = streamText({
            model: provider.languageModel(model, mode),
            includeRawChunks: true,
            messages: modelMessages,
            abortSignal: abortController.signal,
            // v0.3.0: provider.tools already includes the ACP dynamic tool
            tools: provider.tools,
            onError: (err) => {
              console.error("[acp] stream error:", err);
              if (shouldCleanup) provider.cleanup();
            },
          });

          const response = result.toUIMessageStreamResponse({
            messageMetadata: ({ part }) => {
              if (part.type === "raw" && part.rawValue) {
                const parsed = z
                  .string()
                  .transform((str) => {
                    try { return JSON.parse(str); } catch { return null; }
                  })
                  .pipe(z.array(planEntrySchema).optional())
                  .safeParse(part.rawValue);
                if (parsed.success && parsed.data) return { plan: parsed.data };
              }
            },
            onError: (err) => {
              console.error("[acp] toUIMessageStreamResponse error:", err);
              return err instanceof Error ? err.message : String(err);
            },
          });

          if (response.body) {
            const reader = response.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          }
        } catch (err) {
          if ((err as Error)?.name !== "AbortError") {
            console.error("[acp] chat error:", err);
          }
        } finally {
          if (shouldCleanup) provider.cleanup();
          controller.close();
        }
      },
      cancel() {
        abortController.abort();
        if (shouldCleanup) provider.cleanup();
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    },
  );
});
