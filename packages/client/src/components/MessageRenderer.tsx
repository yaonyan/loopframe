import type { UIMessage, DynamicToolUIPart } from "ai";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  Tool,
  ToolHeader,
  ToolInput,
  ToolOutput,
  ToolContent,
  type ToolPart,
} from "@/components/ai-elements/tool";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Plan, PlanHeader, PlanTitle, PlanContent } from "@/components/ai-elements/plan";

type Part = UIMessage["parts"][number];
type MetaWithPlan = { plan?: Array<{ title?: string; description?: string }> };

type FlatToolPart = {
  type: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function extractToolName(type: string): string {
  return type.startsWith("tool-") ? type.slice(5) : type;
}

function renderPart(part: Part, key: string, isStreaming: boolean): React.ReactNode {
  const type = part.type;

  if (type === "text") {
    return <MessageResponse key={key}>{(part as any).text}</MessageResponse>;
  }

  if (type === "reasoning") {
    return (
      <Reasoning key={key} isStreaming={isStreaming}>
        <ReasoningTrigger />
        <ReasoningContent>{(part as any).text}</ReasoningContent>
      </Reasoning>
    );
  }

  if (type === "step-start") return null;

  if (type === "dynamic-tool") {
    const dp = part as unknown as DynamicToolUIPart;
    return (
      <Tool key={key}>
        <ToolHeader type={dp.type} state={dp.state} toolName={dp.toolName} />
        <ToolContent>
          {(dp as any).input != null && <ToolInput input={(dp as any).input} />}
          {((dp as any).output != null || (dp as any).errorText) && (
            <ToolOutput
              output={(dp as any).output}
              errorText={(dp as any).errorText}
            />
          )}
        </ToolContent>
      </Tool>
    );
  }

  if (typeof type === "string" && type.startsWith("tool-")) {
    const tp = part as unknown as FlatToolPart;
    return (
      <Tool key={key}>
        <ToolHeader
          type="dynamic-tool"
          state={tp.state as DynamicToolUIPart["state"]}
          toolName={extractToolName(tp.type)}
        />
        <ToolContent>
          {tp.input != null && <ToolInput input={tp.input} />}
          {(tp.output != null || tp.errorText) && (
            <ToolOutput
              output={tp.output as ToolPart["output"]}
              errorText={tp.errorText}
            />
          )}
        </ToolContent>
      </Tool>
    );
  }

  return null;
}

interface MessageRendererProps {
  messages: UIMessage[];
  isStreaming?: boolean;
}

export function MessageRenderer({ messages, isStreaming = false }: MessageRendererProps) {
  return (
    <div className="flex flex-col gap-3 py-4">
      {messages.map((msg) => {
        const meta = msg.metadata as MetaWithPlan | undefined;
        const lastMsg = messages[messages.length - 1];
        const msgStreaming = isStreaming && msg.id === lastMsg?.id;
        const isUser = msg.role === "user";

        return (
          <Message key={msg.id} from={msg.role} className={isUser ? "" : "max-w-full"}>
            {/* User: standard MessageContent with bubble */}
            {isUser ? (
              <MessageContent>
                {msg.parts?.map((part, i) => renderPart(part, i.toString(), msgStreaming))}
              </MessageContent>
            ) : (
              /*
               * Assistant: override overflow-hidden → visible on container,
               * so inner code blocks handle their own horizontal scroll.
               */
              <MessageContent
                className="overflow-x-auto min-w-0 w-full max-w-full"
                style={{ overflowX: "auto", overflowY: "visible" }}
              >
                {/* ACP Plan */}
                {meta?.plan && meta.plan.length > 0 && (
                  <Plan>
                    <PlanHeader>
                      <PlanTitle>{`Plan · ${meta.plan.length} steps`}</PlanTitle>
                    </PlanHeader>
                    <PlanContent>
                      <ol className="list-decimal pl-4 space-y-1 text-xs text-muted-foreground">
                        {meta.plan.map((step, i) => (
                          <li key={i}>{step.title ?? step.description ?? `Step ${i + 1}`}</li>
                        ))}
                      </ol>
                    </PlanContent>
                  </Plan>
                )}
                {msg.parts?.map((part, i) => renderPart(part, i.toString(), msgStreaming))}
              </MessageContent>
            )}
          </Message>
        );
      })}
    </div>
  );
}
