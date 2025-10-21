import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Icon } from "@workspace/ui/components/logo";
import Dither, {
  DashedPattern,
  HorizontalLine,
} from "@workspace/ui/components/surface";
import { BookOpenText, Inbox, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="w-screen min-h-screen flex flex-col overflow-hidden items-center overflow-x-hidden relative">
      <header className="h-15 border-b flex justify-center w-full px-4 sticky top-0 backdrop-blur-md">
        <div className="flex items-center h-full w-full max-w-6xl justify-between">
          <a href="/" className="flex items-center gap-2">
            <Icon className="size-5" />
            <h1 className="text-lg font-normal">FrontDesk</h1>
          </a>
          <div className="flex items-center gap-2">
            <Button variant="ghost">Sign In</Button>
            <Button variant="default">Sign Up</Button>
          </div>
        </div>
      </header>
      <main className="w-full max-w-6xl grid grid-cols-12">
        <section
          id="hero"
          className="col-span-12 flex flex-col items-center py-32 relative border-b border-x"
        >
          <div className="absolute inset-0 text-muted-foreground/50 grid grid-cols-[repeat(20,1fr)] -z-50">
            {/* <DashedPattern className="border-r" /> */}
            <Dither
              waveColor={[0.7, 0.7, 0.7]}
              disableAnimation={false}
              enableMouseInteraction={false}
              colorNum={4}
              pixelSize={3.5}
              waveAmplitude={0.3}
              waveFrequency={3}
              waveSpeed={0.05}
              className="col-span-full opacity-15"
            />
            {/* <DashedPattern className="col-start-20 border-l" /> */}
          </div>
          <div className="w-full max-w-2xl text-center flex flex-col gap-10 px-6">
            <h1 className="text-5xl font-bold text-center">
              Support your customers wherever they are
            </h1>
            <span className="text-xl">
              FrontDesk is the customer support tool built for speed and
              simplicity. Transform support tickets into a public, indexable,
              searchable knowledge base — getting pSEO for free
            </span>
            <div className="flex gap-4 mx-auto max-w-md w-full">
              <Input
                placeholder="Enter your email..."
                className="w-full dark:bg-background/75"
              />
              <Button variant="default">Request access</Button>
            </div>
          </div>
        </section>
        <HorizontalLine variant="outer" />
        <DashedPattern className="col-span-full h-3 text-muted-foreground/50 border-x border-b" />
        <HorizontalLine variant="outer" />
        <section
          id="features"
          className="grid grid-cols-3 col-span-full border-x"
        >
          <div className="text-muted-foreground col-span-full font-mono uppercase pt-8 pb-4 px-4">
            01 - Main features
          </div>
          <div className="border-y h-48 flex flex-col px-4 py-6 gap-2">
            <Inbox className="size-8 text-muted-foreground stroke-[1.2] mb-4" />
            <div className="text-lg font-medium">Unified inbox</div>
            <div className="text-muted-foreground">
              All your support channels in one place. No more switching between
              apps.
            </div>
          </div>
          <div className="border-y border-x h-48 flex flex-col px-4 py-6 gap-2">
            <Zap className="size-8 text-muted-foreground stroke-[1.2] mb-4" />
            <div className="text-lg font-medium">Built for speed</div>
            <div className="text-muted-foreground">
              Realtime sync, no page loads, instant searches. FrontDesk doesn't
              make you wait.
            </div>
          </div>
          <div className="border-y h-48 flex flex-col px-4 py-6 gap-2">
            <BookOpenText className="size-8 text-muted-foreground stroke-[1.2] mb-4" />
            <div className="text-lg font-medium">Public support</div>
            <div className="text-muted-foreground">
              Your support threads are public, indexable, and searchable.
              Customers can find answers without waiting for a response.
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
