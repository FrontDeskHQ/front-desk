import type { Migration } from "../types";

const migration: Migration = {
  name: "004_backfill_external_entity_addressing",
  up: async ({ db }) => {
    const entities = await db.externalEntity.where({}).get();
    const integrations = await db.integration.where({}).get();

    for (const entity of entities) {
      if (entity.provider !== "github") {
        continue;
      }

      const integration = integrations.find(
        (candidate) =>
          candidate.organizationId === entity.organizationId &&
          candidate.type === entity.provider
      );
      const [owner, repo] = entity.repoFullName.split("/", 2);

      await db.externalEntity.update(entity.id, {
        containerId: entity.repoFullName,
        containerKind: "repository",
        containerLabel: entity.repoFullName,
        externalRef: {
          number: entity.number,
          owner: owner ?? "",
          repo: repo ?? "",
        },
        integrationId: integration?.id ?? null,
        shortId: String(entity.number),
      });
    }
  },
};

export default migration;
