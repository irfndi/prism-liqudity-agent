import "dotenv/config";
import { Effect } from "effect";
import { program, buildLayer } from "./program.js";

Effect.runPromise(
  program.pipe(
    Effect.provide(buildLayer()),
    Effect.catchAll((err) =>
      Effect.sync(() => {
        console.error("Fatal error:", err);
        process.exit(1);
      }),
    ),
  ),
);
