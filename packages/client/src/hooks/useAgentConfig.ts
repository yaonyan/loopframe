import { useState, useCallback } from "react";
import type { AgentConfig } from "@loopframe/shared";

const STORAGE_KEY = "loopframe:agentConfig";

const DEFAULT_AGENT: AgentConfig = {
  id: "codebuddy",
  name: "CodeBuddy",
  command: "codebuddy",
  args: ["--acp"],
};

export function useAgentConfig() {
  const [config, setConfigState] = useState<AgentConfig>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_AGENT;
    } catch {
      return DEFAULT_AGENT;
    }
  });

  const setConfig = useCallback((c: AgentConfig) => {
    setConfigState(c);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  }, []);

  return { config, setConfig };
}
