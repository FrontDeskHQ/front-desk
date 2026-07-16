import { createLiveStateClient } from "@connectors/framework/runtime";

export const { client, store, fetchClient } = createLiveStateClient({
  botKey: process.env.DISCORD_BOT_KEY ?? "",
  label: "Slack",
});
