import { z } from "zod";

/**
 * Customer-facing conversation origins supported by the local developer CLI.
 *
 * This is intentionally narrower than connector provider names: the CLI is
 * simulating the customer side of a conversation, not registering a new
 * integration.
 */
export const customerChannelSchema = z.enum([
  "slack",
  "discord",
  "widget",
  "portal",
]);

export type CustomerChannel = z.infer<typeof customerChannelSchema>;
