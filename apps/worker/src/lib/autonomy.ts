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
  const org = (await fetchClient.query.organization.byId({
    id: organizationId,
  })) as OrgRow | undefined;
  const parsed = safeParseOrgSettings(org?.settings);
  return { ...getDefaultActionAutonomy(), ...(parsed.actionAutonomy ?? {}) };
}

export async function getLabelAutonomyMode(
  organizationId: string,
): Promise<AutonomyLevel> {
  const map = await getOrgActionAutonomy(organizationId);
  return map.apply_label;
}

export async function getStatusAutonomyMode(
  organizationId: string,
): Promise<AutonomyLevel> {
  const map = await getOrgActionAutonomy(organizationId);
  return map.set_status;
}
