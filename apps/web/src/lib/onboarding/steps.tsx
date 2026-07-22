import { ChangeThreadPropertyContent } from "~/components/onboarding/step-content/change-thread-property";
import { ConnectIntegrationContent } from "~/components/onboarding/step-content/connect-integration";
import { CreateLabelsContent } from "~/components/onboarding/step-content/create-labels";
import { InviteTeamContent } from "~/components/onboarding/step-content/invite-team";
import { ResolveThreadContent } from "~/components/onboarding/step-content/resolve-thread";

import type { OnboardingContext, OnboardingStep } from "./types";

export const onboardingSteps: OnboardingStep[] = [
  {
    description: "Connect Discord, Slack, or GitHub to start receiving threads",
    id: "connect-integration",
    isComplete: (context: OnboardingContext) =>
      context.integrations?.some((i) => i.enabled) ?? false,
    popoverContent: <ConnectIntegrationContent />,
    title: "Connect an integration",
  },
  {
    description: "Collaborate with your team members",
    id: "invite-team",
    isComplete: (context: OnboardingContext) => (context.teamMembers ?? 0) > 1,
    popoverContent: <InviteTeamContent />,
    title: "Invite your team",
  },
  {
    description: "Update a thread's status, priority, or assignee",
    id: "change-thread-property",
    isComplete: (context: OnboardingContext) =>
      context.hasModifiedThread ?? false,
    popoverContent: <ChangeThreadPropertyContent />,
    title: "Change a thread property",
  },
  {
    description: "Organize your threads with custom labels",
    id: "create-labels",
    isComplete: (context: OnboardingContext) => (context.labels ?? 0) > 0,
    popoverContent: <CreateLabelsContent />,
    title: "Create labels",
  },
  {
    description: "Mark a thread as resolved when the issue is handled",
    id: "resolve-thread",
    isComplete: (context: OnboardingContext) =>
      context.hasResolvedThread ?? false,
    popoverContent: <ResolveThreadContent />,
    title: "Resolve a thread",
  },
];
