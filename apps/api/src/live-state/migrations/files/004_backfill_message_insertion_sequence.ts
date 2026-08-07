import { nextMessageInsertionSequence } from "../../../lib/message-sequence";
import type { Migration } from "../types";

const migration: Migration = {
  name: "004_backfill_message_insertion_sequence",
  transactional: false,
  up: async ({ db }) => {
    const batchSize = 500;
    let processed = 0;

    while (true) {
      const messages = await db.message
        .where({ insertionSequence: null })
        .orderBy("createdAt", "asc")
        .orderBy("id", "asc")
        .limit(batchSize)
        .get();

      if (messages.length === 0) {
        break;
      }

      await db.transaction(async ({ trx }) => {
        for (const message of messages) {
          const insertionSequence = await nextMessageInsertionSequence(
            trx,
            message.threadId
          );
          await trx.message.update(message.id, { insertionSequence });
        }
      });

      processed += messages.length;
      console.log(
        `[migrations] 004_backfill_message_insertion_sequence: backfilled ${processed} messages`
      );
    }
  },
};

export default migration;
