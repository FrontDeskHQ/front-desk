import { z } from "zod";
import { createReadThroughCache } from "../../lib/cache/read-through.js";

const BASE_SLACK_SERVER_URL =
  process.env.BASE_SLACK_SERVER_URL || "http://localhost:3011";

const SLACK_CHANNELS_FETCH_TIMEOUT_MS = 10_000;

const SlackChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  isPrivate: z.boolean(),
});

const SlackChannelsResponseSchema = z.object({
  channels: z.array(SlackChannelSchema).default([]),
});

export type SlackChannel = z.infer<typeof SlackChannelSchema>;

type FetchSlackChannelsInput = {
  organizationId: string;
  teamId: string;
};

const formatZodIssues = (error: z.ZodError): string =>
  error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");

const fetchSlackChannelsFromService = async (
  input: FetchSlackChannelsInput,
): Promise<{ channels: SlackChannel[] }> => {
  const url = new URL("/api/channels", BASE_SLACK_SERVER_URL);
  url.searchParams.set("team_id", input.teamId);

  const response = await fetch(url.toString(), {
    headers: {
      "x-discord-bot-key": process.env.DISCORD_BOT_KEY ?? "",
    },
    signal: AbortSignal.timeout(SLACK_CHANNELS_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Slack channels: ${response.status} ${response.statusText}`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`Slack channels response was not valid JSON: ${cause}`);
  }

  const parsed = SlackChannelsResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(
      `Invalid Slack channels response shape: ${formatZodIssues(parsed.error)}`,
    );
  }

  return { channels: parsed.data.channels };
};

export const slackChannelsCache = createReadThroughCache<
  FetchSlackChannelsInput,
  { channels: SlackChannel[] }
>({
  namespace: "slack-channels",
  fetch: fetchSlackChannelsFromService,
  ttl: 300000, // 5 minutes
  swr: 30000, // 30 seconds stale-while-revalidate
  keyGenerator: (input) => `${input.organizationId}:${input.teamId}`,
});
