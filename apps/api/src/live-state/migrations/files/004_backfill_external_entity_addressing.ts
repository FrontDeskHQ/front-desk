import type { Migration } from "../types";

const BATCH_SIZE = 500;

const migration: Migration = {
  name: "004_backfill_external_entity_addressing",
  transactional: false,
  up: async ({ db }) => {
    let processed = 0;

    while (true) {
      const entities = await db.externalEntity
        .where({ containerId: null, provider: "github" })
        .orderBy("id", "asc")
        .limit(BATCH_SIZE)
        .get();

      if (entities.length === 0) {
        break;
      }

      await db.transaction(async ({ trx }) => {
        const integrationIds = new Map<string, string | null>();

        for (const entity of entities) {
          const integrationKey = `${entity.organizationId}:${entity.provider}`;
          if (!integrationIds.has(integrationKey)) {
            const integration = (
              await trx.integration
                .where({
                  enabled: true,
                  organizationId: entity.organizationId,
                  type: entity.provider,
                })
                .orderBy("id", "asc")
                .limit(1)
                .get()
            )[0];
            integrationIds.set(integrationKey, integration?.id ?? null);
          }

          const [owner, repo] = entity.repoFullName.split("/", 2);

          await trx.externalEntity.update(entity.id, {
            containerId: entity.repoFullName,
            containerKind: "repository",
            containerLabel: entity.repoFullName,
            externalRef: {
              number: entity.number,
              owner: owner ?? "",
              repo: repo ?? "",
            },
            integrationId: integrationIds.get(integrationKey) ?? null,
            shortId: String(entity.number),
          });
        }
      });

      processed += entities.length;
      console.log(
        `[migrations] 004_backfill_external_entity_addressing: backfilled ${processed} entities`
      );
    }
  },
};

export default migration;
