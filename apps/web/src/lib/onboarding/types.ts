import type { ReactNode } from "react";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  popoverContent: ReactNode;
  isComplete?: (context: OnboardingContext) => boolean;
}

export interface OnboardingContext {
  organizationId: string;
  integrations?: Array<{ type: string; enabled: boolean }>;
  teamMembers?: number;
  labels?: number;
  hasModifiedThread?: boolean;
  hasResolvedThread?: boolean;
}

export interface CompletedStep {
  completedAt: string;
}

export type OnboardingStatus = "incomplete" | "completed" | "skipped";
