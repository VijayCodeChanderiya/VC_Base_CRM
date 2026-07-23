import { FeatureType } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";

export type EntitlementMap = Record<
  string,
  { type: FeatureType; boolValue?: boolean; numValue?: number | null }
>;

export async function resolveEntitlements(organizationId: string): Promise<EntitlementMap> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    include: {
      plan: { include: { planFeatures: { include: { feature: true } } } },
      featureOverrides: { include: { feature: true } },
    },
  });

  const map: EntitlementMap = {};
  for (const pf of org.plan?.planFeatures ?? []) {
    map[pf.feature.key] = { type: pf.feature.type, boolValue: pf.boolValue ?? undefined, numValue: pf.numValue };
  }
  // Per-org overrides always win over the plan default.
  for (const ov of org.featureOverrides) {
    map[ov.feature.key] = { type: ov.feature.type, boolValue: ov.boolValue ?? undefined, numValue: ov.numValue };
  }
  return map;
}

export async function assertUnderLimit(organizationId: string, key: string, currentCount: number): Promise<void> {
  const entry = (await resolveEntitlements(organizationId))[key];
  if (!entry || entry.numValue == null) return; // unlimited / not configured
  if (currentCount >= entry.numValue) {
    throw new AppError(`Plan limit reached for ${key} (max ${entry.numValue})`, 402);
  }
}
