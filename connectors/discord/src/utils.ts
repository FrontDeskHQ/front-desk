import {
  ForumChannel,
  TextChannel,
  ThreadChannel,
  WebhookClient,
} from "discord.js";

const webhookClients = new Map<string, WebhookClient>();

/**
 * Gets or creates a webhook for a specific channel
 */
export async function getOrCreateWebhook(
  channel: TextChannel | ThreadChannel
): Promise<WebhookClient> {
  // Check if we already have a webhook client for this channel
  const existingWebhook = webhookClients.get(channel.id);
  if (existingWebhook) {
    return existingWebhook;
  }

  try {
    // For threads, get the parent channel
    const targetChannel = "parent" in channel ? channel.parent : channel;
    if (
      !targetChannel ||
      !(
        targetChannel instanceof TextChannel ||
        targetChannel instanceof ForumChannel
      )
    ) {
      throw new Error("Could not get parent text channel for thread");
    }

    // Check if there's a webhook we can use
    const webhooks = await targetChannel.fetchWebhooks();
    let webhook = webhooks.find((w) => w.owner?.id === channel.client.user?.id);

    // If no webhook exists, create one
    if (!webhook) {
      webhook = await targetChannel.createWebhook({
        name: "Front Desk Bot",
        avatar: channel.client.user?.displayAvatarURL(),
        reason: "Auto-created webhook for thread management",
      });
    }

    const webhookClient = new WebhookClient({ url: webhook.url });
    webhookClients.set(channel.id, webhookClient);
    return webhookClient;
  } catch (error) {
    console.error(
      `Error getting/creating webhook for channel ${channel.id}:`,
      error
    );
    throw error;
  }
}
