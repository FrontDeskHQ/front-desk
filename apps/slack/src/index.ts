import "./env";

import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { App } from "@slack/bolt";

const app = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  token: process.env.SLACK_BOT_TOKEN,
});

app.message(
  "hello",
  async ({
    message,
    ack,
    client,
  }: SlackEventMiddlewareArgs<"message"> & AllMiddlewareArgs) => {
    // Slack SDK is VERY BAD
    if (ack && typeof ack === "function") await (ack as () => Promise<void>)();

    console.log(JSON.stringify(message, null, 2));

    const conversation = await client.conversations.info({
      channel: message.channel,
    });

    console.log(JSON.stringify(conversation, null, 2));

    // if (
    //   message.subtype === "message_deleted" ||
    //   message.subtype === "message_replied" ||
    //   message.subtype === "message_changed"
    // )
    //   return;
    // await say(`Hey there <@${message.user}>!`);
  }
);

(async () => {
  await app.start(process.env.PORT || 3011);

  app.logger.info(
    `⚡️ Bolt app is running at port ${process.env.PORT || 3011}!`
  );
})();
