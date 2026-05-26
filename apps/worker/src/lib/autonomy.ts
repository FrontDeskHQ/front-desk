import { safeParseOrgSettings } from "@workspace/schemas/organization";
import {
  type ActionKind,
  type AutonomyLevel,
  getDefaultActionAutonomy,
} from "@workspace/schemas/signals";
import { fetchClient } from "./database/client";

type OrgRow = {
  id: string;
  settings: unknown;
};

export async function getOrgActionAutonomy(
  organizationId: string,
): Promise<Record<ActionKind, AutonomyLevel>> {
  const rows = (await fetchClient.query.organization
    .where({ id: organizationId })
    .get()) as OrgRow[];
  const org = rows[0];
  const parsed = safeParseOrgSettings(org?.settings);
  return { ...getDefaultActionAutonomy(), ...(parsed.actionAutonomy ?? {}) };
}
