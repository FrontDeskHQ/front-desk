import { useMatches } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import {
  createHoverCardHandle,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card";
import { Progress } from "@workspace/ui/components/progress";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar";
import { cn } from "@workspace/ui/lib/utils";
import {
  Cable,
  Check,
  CheckCircle,
  type LucideIcon,
  Minus,
  SlidersHorizontal,
  Tag,
  Users,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { OnboardingStep } from "~/lib/onboarding/types";
import { useOnboarding } from "~/lib/onboarding/use-onboarding";

type HoverCardPayload = {
  step: OnboardingStep & { isCompleted: boolean };
};

const hoverCardHandle = createHoverCardHandle<HoverCardPayload>();

const getStepIcon = (stepId: string): LucideIcon => {
  const iconMap: Record<string, LucideIcon> = {
    "connect-integration": Cable,
    "invite-team": Users,
    "change-thread-property": SlidersHorizontal,
    "create-labels": Tag,
    "resolve-thread": CheckCircle,
  };
  return iconMap[stepId] ?? SlidersHorizontal;
};

export function FirstStepsChecklist() {
  const { isVisible, steps, progress, skipOnboarding, completeOnboarding } =
    useOnboarding();

  const [hoverCardOpen, setHoverCardOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const matches = useMatches();

  useEffect(() => {
    if (hoverCardOpen) {
      setHoverCardOpen(false);
    }
  }, [matches]);

  if (!isVisible) {
    return null;
  }

  // Auto-complete onboarding when all steps are done
  if (progress.completed === progress.total) {
    completeOnboarding();
    return null;
  }

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {collapsed ? (
        <motion.div
          key="collapsed"
          initial={{ opacity: 0.25, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0.25, scale: 0.9 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="pl-9 pt-9"
        >
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            First steps {progress.percentage}%
          </button>
        </motion.div>
      ) : (
        <motion.div
          key="expanded"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          style={{ transformOrigin: "bottom" }}
          className="mb-9"
        >
          <Card>
            <CardContent className="p-2 gap-2">
              <div className="flex items-center justify-between h-6 px-2">
                <div className="text-foreground-secondary">First steps</div>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setCollapsed(true)}
                    aria-label="Collapse onboarding"
                  >
                    <Minus />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={skipOnboarding}
                    aria-label="Dismiss onboarding"
                  >
                    <X />
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <div className="px-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                    <span>
                      {progress.completed} of {progress.total} completed
                    </span>
                  </div>
                  <Progress value={progress.percentage} className="h-1.5" />
                </div>
                <SidebarMenu>
                  {steps.map((step) => {
                    const StepIcon = getStepIcon(step.id);
                    const handleClick = () => {
                      // Force open on click
                      setHoverCardOpen(true);
                    };

                    return (
                      <SidebarMenuItem key={step.id}>
                        <HoverCardTrigger
                          render={
                            <SidebarMenuButton
                              className={cn(
                                "gap-3 justify-between",
                                step.isCompleted && "text-muted-foreground",
                              )}
                              onClick={handleClick}
                            />
                          }
                          handle={hoverCardHandle}
                          payload={{
                            step,
                          }}
                        >
                          <div className="flex items-center gap-3 grow shrink overflow-hidden">
                            <StepIcon className="h-4 w-4" />
                            <div
                              className={cn(
                                "truncate grow shrink",
                                step.isCompleted && "line-through",
                              )}
                            >
                              {step.title}
                            </div>
                          </div>
                          {step.isCompleted && (
                            <Check className="h-4 w-4 text-muted-foreground" />
                          )}
                        </HoverCardTrigger>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
                <HoverCard
                  handle={hoverCardHandle}
                  open={hoverCardOpen}
                  onOpenChange={setHoverCardOpen}
                >
                  {({ payload }) => (
                    <HoverCardContent
                      side="right"
                      align="end"
                      sideOffset={8}
                      className="w-96"
                    >
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">
                          {payload?.step.title}
                        </h4>
                        {payload?.step.popoverContent}
                      </div>
                    </HoverCardContent>
                  )}
                </HoverCard>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
