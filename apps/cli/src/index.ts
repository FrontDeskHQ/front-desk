#!/usr/bin/env bun
import { cac } from "cac";

import "./env.js";
import { runThreadCreate } from "./commands/thread/create.js";

const cli = cac("fd");

cli
  .command("thread <action>", "Thread operations")
  .option(
    "--profile <name>",
    "Config profile to use (defaults to FD_PROFILE, then 'local')"
  )
  .option("--fixture <path>", "Path to a JSON fixture file (object or array)")
  .option("--title <title>", "Thread title (inline mode)")
  .option("--author <name>", "Author display name (inline mode)")
  .option("--message <text>", "Opening message body (inline mode)")
  .option("--fail-fast", "Stop on the first failed thread")
  .option("--verbose", "Log progress to stderr")
  .action(async (action, options) => {
    if (action !== "create") {
      console.error(`Unknown thread action: ${action}`);
      process.exitCode = 1;
      return;
    }

    try {
      const { output, exitCode } = await runThreadCreate({
        author: options.author,
        failFast: options.failFast,
        fixture: options.fixture,
        message: options.message,
        profile: options.profile,
        title: options.title,
        verbose: options.verbose,
      });

      console.log(JSON.stringify(output, null, 2));
      process.exitCode = exitCode;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exitCode = 1;
    }
  });

cli.help();
cli.parse();
