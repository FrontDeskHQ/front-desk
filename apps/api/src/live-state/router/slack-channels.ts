import { createReadThroughCache } from "../../lib/cache/read-through.js";

const BASE_SLACK_SERVER_URL =
  process.env.BASE_SLACK_SERVER_URL || "http://localhost:3011";

export type SlackChannel = {
  id: string;
  name: string;
  isPrivate: boolean;
};

type FetchSlackChannelsInput = {
  organizationId: string;
  teamId: string;
};

const fetchSlackChannelsFromService = async (
  input: FetchSlackChannelsInput,
): Promise<{ channels: SlackChannel[] }> => {
  const url = new URL("/api/channels", BASE_SLACK_SERVER_URL);
  url.searchParams.set("team_id", input.teamId);

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Slack channels: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as { channels: SlackChannel[] };
  return { channels: data.channels ?? [] };
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
