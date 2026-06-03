import { Command } from "commander";
import { Effect, Layer } from "effect";
import { ConfigService, ConfigLive } from "../engine/config-service.js";
import { FeedbackLive } from "../engine/feedback-service.js";
import {
  FeedbackService,
  type AgentFeedback,
  type FeedbackCategory,
  type FeedbackResult,
  type FeedbackSeverity,
} from "../engine/services.js";
import { createLogger } from "../engine/logger.js";

const logger = createLogger("feedback-cli");

const VALID_CATEGORIES: ReadonlyArray<FeedbackCategory> = [
  "friction",
  "suggestion",
  "observation",
  "praise",
];
const VALID_SEVERITIES: ReadonlyArray<FeedbackSeverity> = ["low", "medium", "high"];

function parseCategory(raw: string): FeedbackCategory {
  if (!VALID_CATEGORIES.includes(raw as FeedbackCategory)) {
    throw new Error(`Invalid category '${raw}'. Valid: ${VALID_CATEGORIES.join(", ")}`);
  }
  return raw as FeedbackCategory;
}

function parseSeverity(raw: string): FeedbackSeverity {
  if (!VALID_SEVERITIES.includes(raw as FeedbackSeverity)) {
    throw new Error(`Invalid severity '${raw}'. Valid: ${VALID_SEVERITIES.join(", ")}`);
  }
  return raw as FeedbackSeverity;
}

function buildProgram(): Layer.Layer<FeedbackService | ConfigService, never, never> {
  return Layer.provide(FeedbackLive, ConfigLive) as Layer.Layer<
    FeedbackService | ConfigService,
    never,
    never
  >;
}

function formatResult(result: FeedbackResult): string {
  switch (result.kind) {
    case "created":
      return `✓ Filed new issue #${result.issueNumber}: ${result.issueUrl}`;
    case "duplicate":
      return `✓ +1 to existing issue #${result.issueNumber}: ${result.issueUrl}`;
    case "rate_limited":
      return `⚠ Rate limited: ${result.reason}`;
    case "no_token":
      return "⚠ GITHUB_TOKEN not set. Feedback stored locally only.";
    case "opt_out":
      return "ℹ Feedback is disabled. Run 'prism feedback enable' to re-enable.";
    case "local_only":
      return `✓ Feedback stored locally (id: ${result.localId}). Set GITHUB_TOKEN to file GitHub issues.`;
    case "error":
      return `✗ Failed to submit feedback: ${result.error}`;
  }
}

export const feedbackCommand = new Command("feedback")
  .description("Submit or manage agent feedback (friction, suggestions, observations, praise)")
  .addHelpText(
    "after",
    `\nExamples:
  $ prism feedback "The install process requires manual Bun install" --category friction
  $ prism feedback "Add --yes flag to skip setup prompts" --category suggestion
  $ prism feedback "Scan cycle is 30s on first run" --category observation
  $ prism feedback status
  $ prism feedback list
  $ prism feedback disable

Environment:
  GITHUB_TOKEN              Personal access token with 'repo' scope
  GITHUB_REPO               Target repo (default: irfndi/prism-liquidity-agent)
  PRISM_FEEDBACK_OPT_OUT    Set to 'true' to disable automatic feedback

Requires GITHUB_TOKEN for GitHub Issues filing. Without it, feedback is stored
locally in ~/.config/prism/agent-id and logged but not uploaded.`,
  );

feedbackCommand
  .command("submit")
  .description("Submit a piece of feedback (default action if no subcommand given)")
  .argument("<summary>", "One-line summary of the feedback")
  .option("-c, --category <category>", "friction | suggestion | observation | praise", "friction")
  .option("-s, --severity <severity>", "low | medium | high", "medium")
  .option("-d, --details <details>", "Full description of the feedback")
  .option(
    "-f, --file <file>",
    "Related file path (can be repeated)",
    (value: string, prev: string[]) => {
      return prev ? [...prev, value] : [value];
    },
  )
  .action(async (summary: string, opts) => {
    const category = parseCategory(opts.category);
    const severity = parseSeverity(opts.severity);
    const relatedFiles: string[] = Array.isArray(opts.file)
      ? opts.file
      : opts.file
        ? [opts.file]
        : [];
    const feedback: AgentFeedback = {
      category,
      severity,
      summary,
      details: opts.details,
      relatedFiles: relatedFiles.length > 0 ? relatedFiles : undefined,
      context: {
        prismVersion: "0.0.0",
        installMethod: "unknown",
        platform: "unknown",
        runtime: "unknown",
      },
    };
    const program = buildProgram();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* FeedbackService;
        return yield* service.submit(feedback);
      }).pipe(Effect.provide(program)),
    ).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Feedback submission crashed: ${message}`);
      return { kind: "error" as const, error: message } satisfies FeedbackResult;
    });
    console.log(formatResult(result));
  });

feedbackCommand
  .command("status")
  .description("Show this agent's feedback history and rate-limit state")
  .action(async () => {
    const program = buildProgram();
    await Effect.runPromise(
      Effect.gen(function* () {
        const config = yield* ConfigService;
        const feedback = yield* FeedbackService;
        const optOut = yield* feedback.getOptOut();
        const recent = yield* feedback.listForAgent("self");
        console.log(`Agent feedback status:`);
        console.log(`  Opt-out:       ${optOut ? "yes" : "no"}`);
        console.log(`  GITHUB_TOKEN:  ${config.githubToken ? "set" : "UNSET (local-only mode)"}`);
        console.log(`  GITHUB_REPO:   ${config.githubRepo}`);
        console.log(`  Total reports: ${recent.length}`);
        if (recent.length > 0) {
          console.log("");
          console.log("Recent feedback:");
          for (const r of recent.slice(-10)) {
            const ts = new Date(r.reportedAt).toISOString();
            const target = r.githubIssueNumber ? `→ issue #${r.githubIssueNumber}` : "(local only)";
            console.log(`  [${ts}] ${r.category}/${r.severity} ${target}`);
            console.log(`    ${r.summary}`);
          }
        }
      }).pipe(Effect.provide(program)),
    );
  });

feedbackCommand
  .command("list")
  .description("Alias for 'status'")
  .action(async () => {
    const program = buildProgram();
    await Effect.runPromise(
      Effect.gen(function* () {
        const feedback = yield* FeedbackService;
        const all = yield* feedback.listForAgent("self");
        if (all.length === 0) {
          console.log("No feedback submitted yet from this agent.");
          return;
        }
        for (const r of all) {
          const ts = new Date(r.reportedAt).toISOString();
          const target = r.githubIssueNumber ? `→ #${r.githubIssueNumber}` : "(local)";
          console.log(`[${ts}] ${r.category} ${target}  ${r.summary}`);
        }
      }).pipe(Effect.provide(program)),
    );
  });

feedbackCommand
  .command("disable")
  .description("Disable automatic feedback for this agent")
  .action(async () => {
    const program = buildProgram();
    await Effect.runPromise(
      Effect.gen(function* () {
        const feedback = yield* FeedbackService;
        yield* feedback.setOptOut(true);
        console.log("✓ Feedback disabled. Run 'prism feedback enable' to re-enable.");
      }).pipe(Effect.provide(program)),
    );
  });

feedbackCommand
  .command("enable")
  .description("Re-enable automatic feedback for this agent")
  .action(async () => {
    const program = buildProgram();
    await Effect.runPromise(
      Effect.gen(function* () {
        const feedback = yield* FeedbackService;
        yield* feedback.setOptOut(false);
        console.log("✓ Feedback enabled.");
      }).pipe(Effect.provide(program)),
    );
  });

// Default action: if `prism feedback "summary"` is run, behave like `submit`.
feedbackCommand.action(async (summary: string, opts) => {
  if (typeof summary !== "string") {
    feedbackCommand.help();
    return;
  }
  const category = parseCategory(opts.category ?? "friction");
  const severity = parseSeverity(opts.severity ?? "medium");
  const relatedFiles: string[] = Array.isArray(opts.file)
    ? opts.file
    : opts.file
      ? [opts.file]
      : [];
  const fb: AgentFeedback = {
    category,
    severity,
    summary,
    details: opts.details,
    relatedFiles: relatedFiles.length > 0 ? relatedFiles : undefined,
    context: {
      prismVersion: "0.0.0",
      installMethod: "unknown",
      platform: "unknown",
      runtime: "unknown",
    },
  };
  const program = buildProgram();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* FeedbackService;
      return yield* service.submit(fb);
    }).pipe(Effect.provide(program)),
  ).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Feedback submission crashed: ${message}`);
    return { kind: "error" as const, error: message } satisfies FeedbackResult;
  });
  console.log(formatResult(result));
});
