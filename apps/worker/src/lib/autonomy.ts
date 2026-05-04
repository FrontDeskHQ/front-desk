import { safeParseOrgSettings } from "@workspace/schemas/organization";
import {
  type AutonomyLevel,
  getDefaultSignalAutonomy,
  type SignalType,
} from "@workspace/schemas/signals";
import { fetchClient } from "./database/client";

type OrgRow = {
  id: string;
  settings: unknown;
};

export async function getOrgAutonomy(
  organizationId: string,
): Promise<Record<SignalType, AutonomyLevel>> {
  const rows = (await fetchClient.query.organization
    .where({ id: organizationId })
    .get()) as OrgRow[];
  const org = rows[0];
  const parsed = safeParseOrgSettings(org?.settings);
  return { ...getDefaultSignalAutonomy(), ...(parsed.signalAutonomy ?? {}) };
}
