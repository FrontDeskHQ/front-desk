import { useLiveQuery } from "@live-state/sync/client";
import { useAtomValue } from "jotai/react";
import { useCallback, useEffect, useMemo } from "react";

import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient, mutate, query } from "~/lib/live-state";

import { onboardingSteps } from "./steps";
import type { CompletedStep, OnboardingContext } from "./types";

export function useOnboarding() {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const organizationId = currentOrg?.id;

  // Load onboarding record
  const onboarding = useLiveQuery(query.onboarding.first({ organizationId }));

  // Load context data for auto-completion checks
  const integrations = useLiveQuery(
    query.integration.where({ organizationId })
  );

  const teamMembers = useLiveQuery(
    query.organizationUser.where({ enabled: true, organizationId })
  );

  const labels = useLiveQuery(
    query.label.where({ enabled: true, organizationId })
  );

  const threads = useLiveQuery(
    query.thread.where({ deletedAt: null, organizationId })
  );

  const updates = useLiveQuery(
    query.update.where({
      type: {
        $in: ["status_changed", "priority_changed", "assigned_changed"],
      },
    })
  );

  // Auto-initialize onboarding if it doesn't exist
  useEffect(() => {
    if (organizationId && !onboarding) {
      fetchClient.mutate.onboarding
        .initialize({ organizationId })
        .catch(console.error);
    }
  }, [organizationId, onboarding]);

  // Build context for step completion checks
  const context: OnboardingContext = useMemo(
    () => ({
      hasModifiedThread: (updates?.length ?? 0) > 0,
      hasResolvedThread: threads?.some((t) => t.status === 2) ?? false,
      integrations: integrations?.map((i) => ({
        type: i.type,
        enabled: i.enabled,
      })),
      labels: labels?.length,
      organizationId: organizationId ?? "",
      teamMembers: teamMembers?.length,
    }),
    [organizationId, integrations, teamMembers, labels, updates, threads]
  );

  // Parse completed steps from JSON
  const completedSteps: Record<string, CompletedStep> = useMemo(() => {
    if (!onboarding?.stepsStr) {
      return {};
    }
    try {
      return JSON.parse(onboarding.stepsStr);
    } catch {
      return {};
    }
  }, [onboarding?.stepsStr]);

  // Calculate which steps are complete (from manual completion or auto-detection)
  const stepsWithStatus = useMemo(
    () =>
      onboardingSteps.map((step) => {
        const manuallyCompleted = !!completedSteps[step.id];
        const autoCompleted = step.isComplete?.(context) ?? false;
        return {
          ...step,
          isCompleted: manuallyCompleted || autoCompleted,
        };
      }),
    [completedSteps, context]
  );

  // Calculate progress
  const completedCount = stepsWithStatus.filter((s) => s.isCompleted).length;
  const progress = {
    completed: completedCount,
    percentage: Math.round((completedCount / onboardingSteps.length) * 100),
    total: onboardingSteps.length,
  };

  // Determine visibility
  const isVisible =
    !!onboarding &&
    onboarding.status !== "completed" &&
    onboarding.status !== "skipped";

  // Actions
  const completeStep = useCallback(
    async (stepId: string) => {
      if (!onboarding?.id) {
        return;
      }
      await mutate.onboarding.completeStep({
        onboardingId: onboarding.id,
        stepId,
      });
    },
    [onboarding?.id]
  );

  const skipOnboarding = useCallback(async () => {
    if (!onboarding?.id) {
      return;
    }
    await mutate.onboarding.skip({ onboardingId: onboarding.id });
  }, [onboarding?.id]);

  const completeOnboarding = useCallback(async () => {
    if (!onboarding?.id) {
      return;
    }
    await mutate.onboarding.complete({ onboardingId: onboarding.id });
  }, [onboarding?.id]);

  return {
    completeOnboarding,
    completeStep,
    isVisible,
    onboardingId: onboarding?.id,
    progress,
    skipOnboarding,
    steps: stepsWithStatus,
  };
}
