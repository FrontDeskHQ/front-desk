import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Icon } from "@workspace/ui/components/logo";
import {
  DashedPattern,
  HorizontalLine,
} from "@workspace/ui/components/surface";

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
          <div className="absolute inset-0 text-muted-foreground/50 grid grid-cols-[repeat(20,1fr)]">
            <DashedPattern className="border-r" />
            <DashedPattern className="col-start-20 border-l" />
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
              <Input placeholder="Enter your email..." className="w-full" />
              <Button variant="default">Request access</Button>
            </div>
          </div>
        </section>
        <HorizontalLine variant="outer" />
      </main>
    </div>
  );
}
