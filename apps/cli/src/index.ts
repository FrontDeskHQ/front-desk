#!/usr/bin/env node
import { cac } from "cac";
import "./env.js";
import { runThreadCreate } from "./commands/thread/create.js";

const cli = cac("fd");

cli
  .command("thread <action>", "Thread operations")
  .option("--org <slug>", "Organization slug or ULID (defaults to FD_DEV_ORG)")
  .option("--fixture <path>", "Path to a JSON fixture file (object or array)")
  .option("--title <title>", "Thread title (inline mode)")
  .option("--author <name>", "Author display name (inline mode)")
  .option("--message <text>", "Opening message body (inline mode)")
  .option("--fail-fast", "Stop on the first failed thread")
  .option("--verbose", "Log progress to stderr")
  .action(async (action, options) => {
    if (action !== "create") {
      console.error(`Unknown thread action: ${action}`);
      process.exit(1);
    }

    try {
      const { output, exitCode } = await runThreadCreate({
        org: options.org,
        fixture: options.fixture,
        title: options.title,
        author: options.author,
        message: options.message,
        failFast: options.failFast,
        verbose: options.verbose,
      });

      console.log(JSON.stringify(output, null, 2));
      process.exit(exitCode);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exit(1);
    }
  });

cli.help();
cli.parse();
