#!/usr/bin/env bun
import { cac } from "cac";

import "./env.js";
import { runOrgList } from "./commands/org/list.js";
import { runThreadCreate } from "./commands/thread/create.js";
import { runThreadRead } from "./commands/thread/read.js";
import { runThreadReply } from "./commands/thread/reply.js";

const cli = cac("fd");

cli
  .command("org <action>", "Organization operations")
  .action(async (action) => {
    if (action !== "list") {
      console.error(`Unknown org action: ${action}`);
      process.exitCode = 1;
      return;
    }

    try {
      const { output, exitCode } = await runOrgList();
      console.log(JSON.stringify(output, null, 2));
      process.exitCode = exitCode;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exitCode = 1;
    }
  });

cli
  .command("thread <action> [ref]", "Thread operations")
  .option("--org <slug>", "Organization slug or ULID (defaults to FD_DEV_ORG)")
  .option("--fixture <path>", "Path to a JSON fixture file (object or array)")
  .option("--title <title>", "Thread title (inline mode)")
  .option("--author <name>", "Author display name (inline mode)")
  .option("--message <text>", "Opening message body (inline mode)")
  .option(
    "--channel <channel>",
    "Source channel: slack, discord, widget, or portal (defaults to portal)"
  )
  .option("--after <message-id>", "Only return messages after this cursor")
  .option("--message-file <path>", "Read a reply body from a Markdown file")
  .option("--fail-fast", "Stop on the first failed thread")
  .option("--verbose", "Log progress to stderr")
  .action(async (action, ref, options) => {
    if (action === "read" && !ref) {
      console.error("Thread reference is required for read");
      process.exitCode = 1;
      return;
    }
    if (action === "reply" && !ref) {
      console.error("Thread reference is required for reply");
      process.exitCode = 1;
      return;
    }
    if (action !== "create" && action !== "read" && action !== "reply") {
      console.error(`Unknown thread action: ${action}`);
      process.exitCode = 1;
      return;
    }

    try {
      if (action === "create") {
        const { output, exitCode } = await runThreadCreate({
          author: options.author,
          channel: options.channel,
          failFast: options.failFast,
          fixture: options.fixture,
          message: options.message,
          org: options.org,
          title: options.title,
          verbose: options.verbose,
        });

        console.log(JSON.stringify(output, null, 2));
        process.exitCode = exitCode;
        return;
      }

      if (action === "read") {
        const { output, exitCode } = await runThreadRead({
          after: options.after,
          org: options.org,
          ref,
        });

        console.log(JSON.stringify(output, null, 2));
        process.exitCode = exitCode;
        return;
      }

      const { output, exitCode } = await runThreadReply({
        channel: options.channel,
        message: options.message,
        messageFile: options.messageFile,
        org: options.org,
        ref,
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
