import { nextMessageInsertionSequence } from "../../../lib/message-sequence";
import type { Migration } from "../types";

const migration: Migration = {
  name: "004_backfill_message_insertion_sequence",
  up: async ({ db }) => {
    const messages = await db.message
      .where({ insertionSequence: null })
      .orderBy("createdAt", "asc")
      .orderBy("id", "asc")
      .get();

    for (const message of messages) {
      await db.message.update(message.id, {
        insertionSequence: nextMessageInsertionSequence(),
      });
    }
  },
};

export default migration;
