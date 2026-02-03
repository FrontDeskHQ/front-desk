import { Discord, GitHub, Linear, Slack } from "@workspace/ui/components/icons";
import { HorizontalLine, VerticalLine } from "@workspace/ui/components/surface";
import { ArrowRight, MessagesSquare } from "lucide-react";
import { FeatureCard } from "./feature-card";
import { AiTriageVisual } from "./visuals/ai-triage-visual";
import { CloseLoopVisual } from "./visuals/close-loop-visual";
import { PortalVisual } from "./visuals/portal-visual";
import { UnifiedInboxVisual } from "./visuals/unified-inbox-visual";

export function FeaturesSection() {
  return (
    <section
      id="features"
      className="col-span-full border-x scroll-mt-15 border-b"
    >
      {/* Section header */}
      <div className="text-foreground-secondary col-span-full font-mono uppercase pt-8 pb-4 px-4 border-b">
        01 - HOW IT WORKS
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Card 1: AI Triage — full width */}
        <FeatureCard
          variant="primary"
          title="Every thread, understood instantly"
          body="When a thread arrives, FrontDesk reads it, finds similar past conversations, suggests labels, detects duplicates, and recommends a status before you even open it."
          visual={<AiTriageVisual />}
        />
        <HorizontalLine variant="contained" />

        {/* Card 2: Unified Inbox — half width */}
        <div className="col-span-full md:col-span-1 flex">
          <FeatureCard
            variant="half"
            title="Every channel, one inbox"
            body="Discord, Slack, GitHub, email. All threads in one place. Reply from here, response goes back to the original channel."
            visual={<UnifiedInboxVisual />}
          />
          <VerticalLine className="hidden lg:block" />
        </div>
        <HorizontalLine variant="contained" className="block lg:hidden" />
        {/* Card 3: Community Portal — half width */}
        <FeatureCard
          variant="half"
          title="Answers that help the next person"
          body="Resolved threads become public, searchable pages. Customers find answers through Google before they ask."
          visual={<PortalVisual />}
        />
        <HorizontalLine variant="contained" />

        {/* Card 4: Close the Loop — full width */}
        <FeatureCard
          variant="secondary"
          title="Ship a fix, close the thread"
          body="Link threads to Linear or GitHub. When the issue ships, FrontDesk resolves the thread and notifies the customer. No manual follow-up."
          visual={<CloseLoopVisual />}
          className="border-b-0"
        />
      </div>

      {/* Integrations bar */}
      <HorizontalLine variant="contained" />
      <div className="grid col-span-full grid-cols-8 md:grid-cols-12">
        <div className="col-span-full md:col-span-4 flex flex-col gap-3 px-6 py-4 md:border-r border-b md:border-b-0">
          <h3 className="text-xl font-semibold">Connect everything</h3>
          <p className="text-foreground-secondary leading-relaxed">
            Bring all your channels together. Connect Discord, Slack, GitHub,
            Linear, and more.
          </p>
        </div>
        <div className="border-r flex items-center justify-center min-h-16">
          <Discord className="size-8 text-foreground-secondary" />
        </div>
        <div className="border-r flex items-center justify-center min-h-16">
          <Slack className="size-8 text-foreground-secondary" />
        </div>
        <div className="border-r flex items-center justify-center min-h-16">
          <MessagesSquare className="size-8 text-foreground-secondary" />
        </div>
        <div className="border-r flex items-center justify-center min-h-16">
          <GitHub className="size-8 text-foreground-secondary" />
        </div>
        <div className="border-r flex items-center justify-center min-h-16">
          <Linear className="size-8 text-foreground-secondary" />
        </div>
        <a
          href="/docs/integrations"
          className="col-span-3 flex items-center gap-2 justify-center text-foreground-secondary md:text-lg md:font-light"
        >
          All integrations
          <ArrowRight className="size-4.5 stroke-2" />
        </a>
      </div>
    </section>
  );
}
