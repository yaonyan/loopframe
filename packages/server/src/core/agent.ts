import { createACPProvider } from "@mcpc-tech/acp-ai-provider";
import { streamText } from "ai";
import type { AgentConfig, Harness, ToolCallTrace, TrajectoryStep } from "@loopframe/shared";
import { buildSystemPrompt, collectEnvFromSteps } from "./scaffold.js";

export interface RunAgentOptions {
  harness: Harness;
  instruction: string;
  agentConfig: AgentConfig;
  workspacePath?: string;
  /** Pre-existing trajectory to append to (from setup steps) */
  trajectory?: TrajectoryStep[];
  /** Extra env vars from env_set setup steps */
  extraEnv?: Record<string, string>;
  /** Called with each text chunk as it streams in */
  onTextDelta?: (delta: string) => void;
  /** Called when a tool call starts */
  onToolCall?: (toolName: string, args: unknown) => void;
}

export interface RunAgentResult {
  text: string;
  steps: number;
  duration_ms: number;
  tool_call_trace: ToolCallTrace[];
  trajectory: TrajectoryStep[];
}

export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  const {
    harness, instruction, agentConfig, workspacePath,
    extraEnv = {}, onTextDelta, onToolCall,
  } = opts;
  const trajectory: TrajectoryStep[] = opts.trajectory ?? [];

  const setupEnv = collectEnvFromSteps(harness.setup ?? []);
  const env = { ...process.env, ...setupEnv, ...extraEnv } as Record<string, string>;

  const provider = createACPProvider({
    command: agentConfig.command,
    args: agentConfig.args,
    env,
    session: { cwd: workspacePath ?? process.cwd(), mcpServers: [] },
    persistSession: false,
  } as any);

  const systemPrompt = buildSystemPrompt(
    harness.systemPrompt,
    harness.tools ?? [],
    harness.constraints ?? [],
  );

  const t0 = Date.now();
  let fullText = "";
  const toolCallTrace: ToolCallTrace[] = [];

  try {
    const result = streamText({
      model: provider.languageModel(agentConfig.acpModel, agentConfig.acpMode),
      system: systemPrompt,
      prompt: instruction,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: provider.tools as any,
      includeRawChunks: true,
    });

    // Consume the stream; swallow ACP state_update errors that fire after completion
    try {
      for await (const chunk of result.fullStream) {
        if (chunk.type === "text-delta") {
          fullText += chunk.text;
          onTextDelta?.(chunk.text);
        } else if (chunk.type === "tool-call") {
          const ts = Date.now();
          toolCallTrace.push({ tool: chunk.toolName, args: chunk.args, result: "" });
          trajectory.push({
            seq: trajectory.length,
            kind: "tool_call",
            ts,
            label: chunk.toolName,
            input: chunk.args,
            duration_ms: 0,
          });
          onToolCall?.(chunk.toolName, chunk.args);
        } else if (chunk.type === "tool-result") {
          const rawOutput = (chunk as any).output ?? (chunk as any).result;
          const outputStr = typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput ?? "");

          // Patch trace
          const traceEntry = toolCallTrace.findLast(
            (e) => e.tool === chunk.toolName && e.result === "",
          );
          if (traceEntry) traceEntry.result = outputStr;

          // Patch trajectory
          const trajEntry = trajectory.findLast(
            (e) => e.kind === "tool_call" && e.label === chunk.toolName && !e.output,
          );
          if (trajEntry) {
            trajEntry.output = outputStr.slice(0, 500);
            trajEntry.duration_ms = Date.now() - trajEntry.ts;
          }

          trajectory.push({
            seq: trajectory.length,
            kind: "tool_result",
            ts: Date.now(),
            label: chunk.toolName,
            output: outputStr.slice(0, 500),
          });
        }
      }
    } catch (streamErr: any) {
      // ACP provider throws a schema validation error for state_update:completed
      // notifications after the agent finishes. This is benign — the text has
      // already been received. Log and continue.
      if (!String(streamErr).includes("invalid_union") && !String(streamErr).includes("state_update")) {
        throw streamErr;
      }
      // Otherwise swallow and use whatever text we collected
    }

    // Fallback: if streaming gave no text, try awaiting result.text
    if (!fullText) {
      try {
        fullText = (await result.text) ?? "";
        if (fullText) onTextDelta?.(fullText);
      } catch { /* ignore */ }
    }

    // Also pull tool calls from result.steps for completeness
    if (toolCallTrace.length === 0) {
      const steps = await result.steps.catch(() => []);
      for (const step of steps) {
        for (const tc of step.toolCalls ?? []) {
          const tr = (step.toolResults ?? []).find(
            (r: any) => r.toolCallId === tc.toolCallId,
          );
          const resultStr = tr
            ? (typeof tr.result === "string" ? tr.result : JSON.stringify(tr.result))
            : "";
          toolCallTrace.push({
            tool: tc.toolName,
            args: tc.input ?? (tc as any).args,
            result: resultStr,
          });
          trajectory.push({
            seq: trajectory.length,
            kind: "tool_call",
            ts: t0,
            label: tc.toolName,
            input: tc.input ?? (tc as any).args,
            output: resultStr.slice(0, 500),
          });
        }
      }
    }

    if (fullText) {
      trajectory.push({
        seq: trajectory.length,
        kind: "text_output",
        ts: Date.now(),
        label: "agent_output",
        output: fullText.slice(0, 1000),
        duration_ms: Date.now() - t0,
      });
    }

    const steps = await result.steps.catch(() => []);
    return {
      text: fullText,
      steps: steps.length,
      duration_ms: Date.now() - t0,
      tool_call_trace: toolCallTrace,
      trajectory,
    };
  } finally {
    provider.cleanup();
  }
}
