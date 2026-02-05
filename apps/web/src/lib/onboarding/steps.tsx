import { ChangeThreadPropertyContent } from "~/components/onboarding/step-content/change-thread-property";
import { ConnectIntegrationContent } from "~/components/onboarding/step-content/connect-integration";
import { CreateLabelsContent } from "~/components/onboarding/step-content/create-labels";
import { InviteTeamContent } from "~/components/onboarding/step-content/invite-team";
import { ResolveThreadContent } from "~/components/onboarding/step-content/resolve-thread";
import type { OnboardingContext, OnboardingStep } from "./types";

export const onboardingSteps: OnboardingStep[] = [
  {
    id: "connect-integration",
    title: "Connect an integration",
    description: "Connect Discord, Slack, or GitHub to start receiving threads",
    popoverContent: <ConnectIntegrationContent />,
    isComplete: (context: OnboardingContext) =>
      context.integrations?.some((i) => i.enabled) ?? false,
  },
  {
    id: "invite-team",
    title: "Invite your team",
    description: "Collaborate with your team members",
    popoverContent: <InviteTeamContent />,
    isComplete: (context: OnboardingContext) => (context.teamMembers ?? 0) > 1,
  },
  {
    id: "change-thread-property",
    title: "Change a thread property",
    description: "Update a thread's status, priority, or assignee",
    popoverContent: <ChangeThreadPropertyContent />,
    isComplete: (context: OnboardingContext) =>
      context.hasModifiedThread ?? false,
  },
  {
    id: "create-labels",
    title: "Create labels",
    description: "Organize your threads with custom labels",
    popoverContent: <CreateLabelsContent />,
    isComplete: (context: OnboardingContext) => (context.labels ?? 0) > 0,
  },
  {
    id: "resolve-thread",
    title: "Resolve a thread",
    description: "Mark a thread as resolved when the issue is handled",
    popoverContent: <ResolveThreadContent />,
    isComplete: (context: OnboardingContext) =>
      context.hasResolvedThread ?? false,
  },
];
