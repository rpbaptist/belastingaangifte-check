import { claudeCode, opencode, type AgentProvider } from "@ai-hero/sandcastle";

export type BuildHarness = "claude" | "opencode";

const DEFAULT_MODELS: Record<BuildHarness, string> = {
  claude: "claude-sonnet-5",
  opencode: "opencode/muse-spark-1.2-contributor-free",
};

export function getBuildAgent(harness: BuildHarness, modelOverride?: string): AgentProvider {
  const model = modelOverride ?? DEFAULT_MODELS[harness];
  switch (harness) {
    case "opencode":
      return opencode(model, { agent: "build" });
    case "claude":
      return claudeCode(model);
    default: {
      const exhaustive: never = harness;
      throw new Error(`Unknown build harness "${exhaustive}" (supported: claude|opencode)`);
    }
  }
}
