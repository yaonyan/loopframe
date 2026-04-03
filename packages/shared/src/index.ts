// ============================================================================
// Harness — executable agent orchestration structure
// ============================================================================

/**
 * A HarnessStep describes one deterministic phase of the harness execution.
 * Steps run in order: setup → (agent) → verify → teardown
 */
export type HarnessStepKind =
  | "shell"          // run a shell command
  | "file_write"     // write a file to the workspace
  | "file_delete"    // delete a file
  | "git_reset"      // reset workspace to a git ref
  | "env_set";       // set environment variables for the agent session

export interface HarnessStep {
  id: string;
  kind: HarnessStepKind;
  label?: string;
  /** shell command string (kind=shell) */
  command?: string;
  /** file path relative to workspace (kind=file_write, file_delete) */
  path?: string;
  /** file content (kind=file_write) */
  content?: string;
  /** git ref e.g. "HEAD" (kind=git_reset) */
  ref?: string;
  /** env vars map (kind=env_set) */
  env?: Record<string, string>;
}

/**
 * A Assertion is a deterministic check run after the agent finishes.
 * The harness scores the run based on how many assertions pass.
 */
export type AssertionKind =
  | "output_contains"       // agent final text output contains substring
  | "output_not_contains"   // agent final text output does NOT contain substring
  | "file_exists"           // file exists in workspace after run
  | "file_not_exists"       // file does not exist
  | "file_contains"         // file content contains substring
  | "command_output"        // run command, check stdout contains substring
  | "tool_was_called"       // tool name appears in trajectory
  | "tool_not_called";      // tool name does NOT appear in trajectory

export interface HarnessAssertion {
  id: string;
  kind: AssertionKind;
  label?: string;
  /** substring to check (output_contains, output_not_contains, file_contains, command_output) */
  value?: string;
  /** file path relative to workspace (file_exists, file_not_exists, file_contains) */
  path?: string;
  /** shell command whose stdout to check (command_output) */
  command?: string;
  /** tool name to check (tool_was_called, tool_not_called) */
  tool?: string;
  /** weight 0–1, defaults to 1/total (used in scoring) */
  weight?: number;
}

export interface Harness {
  id: string;
  name: string;
  domain: string;
  description: string;

  // ── Agent configuration ───────────────────────────────────────────────────
  systemPrompt: string;
  /**
   * Allowed tool names. Injected into system prompt as explicit allowlist.
   * Also used to register client-side tools via acpTools().
   */
  tools: string[];
  /**
   * Declarative constraints, injected into system prompt.
   * Also used for heuristic violation checks post-run.
   */
  constraints: string[];

  // ── Deterministic scaffolding ─────────────────────────────────────────────
  /** Steps to run before the agent starts (environment setup) */
  setup: HarnessStep[];
  /** Deterministic assertions to evaluate after the agent finishes */
  verify: HarnessAssertion[];
  /** Steps to run after verify (cleanup) */
  teardown: HarnessStep[];

  // ── Metadata ──────────────────────────────────────────────────────────────
  tags: string[];
  color: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  score?: number;
  evolveCount: number;
}

// ============================================================================
// Task — a test case for regulating a harness
// ============================================================================

export interface Task {
  id: string;
  name: string;
  instruction: string;
  expectedOutput?: string;
  harnessId?: string;
}

// ============================================================================
// Trajectory — semantic step recording
// ============================================================================

export type TrajectoryStepKind =
  | "tool_call"
  | "tool_result"
  | "text_output"
  | "setup_step"
  | "verify_step"
  | "teardown_step";

export interface TrajectoryStep {
  seq: number;
  kind: TrajectoryStepKind;
  ts: number;
  /** tool name or step label */
  label: string;
  /** input / args */
  input?: unknown;
  /** output / result */
  output?: string;
  /** error if failed */
  error?: string;
  /** duration in ms */
  duration_ms?: number;
}

/** Legacy compat */
export interface ToolCallTrace {
  tool: string;
  args: unknown;
  result: string;
  error?: string;
}

// ============================================================================
// Assertion result
// ============================================================================

export interface AssertionResult {
  id: string;
  kind: AssertionKind;
  label?: string;
  passed: boolean;
  actual?: string;
  expected?: string;
  error?: string;
}

export interface TaskResult {
  task: string;
  score: number;
  passed: boolean;
  duration_ms: number;
  stdout: string;
  stderr: string;
  error?: string;
  full_output?: string;
  /** Legacy flat list, kept for regulator prompts */
  tool_call_trace?: ToolCallTrace[];
  violated_constraints?: string[];
  /** Structured step-by-step record */
  trajectory?: TrajectoryStep[];
  /** Per-assertion breakdown */
  assertion_results?: AssertionResult[];
}

export interface BenchSummary {
  harnessId: string;
  passed: number;
  total: number;
  avg_score: number;
  duration_ms: number;
  results: TaskResult[];
  startedAt: string;
}

// ============================================================================
// Regulation — cybernetic harness regulation loop types
// ============================================================================

export interface ErrorObservation {
  task_id: string;
  task_instruction: string;
  expected_output?: string;
  full_output: string;
  tool_call_trace: ToolCallTrace[];
  steps_taken: number;
  duration_ms: number;
  output_diff?: string;
  violated_constraints: string[];
  /** Failed assertions with detail */
  failed_assertions?: AssertionResult[];
  /** Trajectory summary: label of each step */
  trajectory_summary?: string[];
}

export type RegulationDecision =
  | { type: "ATTENUATE"; system_prompt: string; actuation_description: string }
  | { type: "BIFURCATE"; reasoning: string }
  | { type: "EQUILIBRATE"; reasoning: string }
  | { type: "SATURATE"; reasoning: string };

export interface ActuationEntry {
  iteration: number;
  actuation_description: string;
  before_score: number;
  after_score: number;
  committed: boolean;
  destabilized_states?: string[];
}

export interface RegulatorMemory {
  harness_id: string;
  total_actuations: number;
  last_regulated_at: string;
  actuation_log: ActuationEntry[];
  attenuated_signals: string[];
  stable_states: string[];
}

// ============================================================================
// Workspace
// ============================================================================

export interface WorkspaceConfig {
  id: string;
  label: string;
  path: string;
}

// ============================================================================
// Run Task
// ============================================================================

export interface RunTaskRequest {
  harnessId: string;
  instruction: string;
  workspacePath: string;
  agentConfig: AgentConfig;
}

export interface RunTaskResult {
  output: string;
  steps: number;
  duration_ms: number;
  tool_call_trace: ToolCallTrace[];
  violated_constraints: string[];
  trajectory: TrajectoryStep[];
  assertion_results: AssertionResult[];
  score: number;
}

// ============================================================================
// Agent config
// ============================================================================

export interface AgentEnvItem {
  key: string;
  label: string;
  default?: string;
  secret?: boolean;
}

export interface AgentConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  acpModel?: string;
  acpMode?: string;
  env?: AgentEnvItem[];
  installCommand?: string;
  configHint?: string;
  configLink?: string;
}

// ============================================================================
// WebSocket messages
// ============================================================================

export type WsMessageType =
  | "regulation:start"
  | "regulation:actuate"
  | "regulation:committed"
  | "regulation:reverted"
  | "regulation:decision"
  | "regulation:done"
  | "regulation:error"
  | "task:start"
  | "task:step"
  | "task:done"
  | "task:error"
  | "evolve:start"
  | "evolve:task-start"
  | "evolve:task-done"
  | "evolve:done"
  | "evolve:error"
  | "log";

export interface WsMessage {
  type: WsMessageType;
  payload: unknown;
  ts: number;
}

// ============================================================================
// Evolve / Regulation session
// ============================================================================

export type EvolveStatus = "idle" | "running" | "done" | "error";

export interface EvolveState {
  status: EvolveStatus;
  harnessId: string | null;
  iteration: number;
  maxIterations: number;
  summary: BenchSummary | null;
  regulatorMemory?: RegulatorMemory | null;
  lastDecision?: RegulationDecision | null;
  error?: string;
}

// ============================================================================
// Hub item
// ============================================================================

export type HubItemType = "harness" | "tip" | "pattern";

export interface HubItem {
  id: string;
  type: HubItemType;
  title: string;
  description: string;
  domain: string;
  tags: string[];
  color: string;
  content: string;
  createdAt: string;
}

// ============================================================================
// API response wrappers
// ============================================================================

export interface ApiOk<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
}

export type ApiResult<T> = ApiOk<T> | ApiError;
