import { claudeCode, opencode, type AgentProvider } from "@ai-hero/sandcastle";

export type BuildHarness = "claude" | "opencode";

const DEFAULT_MODELS: Record<BuildHarness, string> = {
  claude: "claude-opus-4-8",
  opencode: "opencode/muse-spark-1.2-contributor-free",
};

export function getBuildAgent(
  harness: BuildHarness,
  modelOverride?: string,
): AgentProvider {
  const model = modelOverride ?? DEFAULT_MODELS[harness];
  switch (harness) {
    case "opencode":
      return opencode(model, { agent: "build" });
    case "claude":
      return claudeCode(model, { effort: "high" });
    default: {
      const exhaustive: never = harness;
      throw new Error(
        `Unknown build harness "${exhaustive}" (supported: claude|opencode)`,
      );
    }
  }
}
