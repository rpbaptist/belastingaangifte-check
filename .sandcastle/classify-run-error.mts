// Distinguishes a checkpoint-timeout abort (main.mts's AbortController
// ceiling) from any other run() failure, without needing to mock
// Docker/Sandcastle — classification is a pure function over the error
// object itself.

const CHECKPOINT_TIMEOUT_SENTINEL = "RALPH_CHECKPOINT_TIMEOUT_HIT";

export function formatCheckpointDuration(timeoutMs: number): string {
  return `${Math.round(timeoutMs / 60000)}m`;
}

// Thrown as the AbortController's abort reason when the wall-clock
// ceiling fires. Its message is the sentinel line loop.sh's
// is_checkpoint_timeout() greps for in the run's log output.
export class CheckpointTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(
      `${CHECKPOINT_TIMEOUT_SENTINEL}: run exceeded ${formatCheckpointDuration(timeoutMs)} (${timeoutMs}ms)`,
    );
    this.name = "CheckpointTimeoutError";
  }
}

export type RunErrorClassification = "checkpoint-timeout" | "other";

export function classifyRunError(err: unknown): RunErrorClassification {
  return err instanceof Error && err.message.includes(CHECKPOINT_TIMEOUT_SENTINEL)
    ? "checkpoint-timeout"
    : "other";
}
