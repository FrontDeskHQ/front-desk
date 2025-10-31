import { createFileRoute } from "@tanstack/react-router";
import { GitHub, XformerlyTwitter } from "@workspace/ui/components/icons";
import { Logo } from "@workspace/ui/components/logo";
import Dither from "~/components/dither";
import { WaitlistForm } from "~/components/form";
import { waitlistCount } from "~/lib/sever-funcs";

export const Route = createFileRoute("/")({
  component: Home,
  loader: async () => {
    const count = await waitlistCount();

    return count;
  },
});

function Home() {
  return (
    <div className="w-full min-h-screen flex flex-col overflow-hidden">
      <div className="w-full h-12 border-b flex items-center justify-between px-4 ">
        <div className="flex gap-2 items-center">
          <Logo>
            <Logo.Icon className="size-6" />
          </Logo>
          <h1 className="text-xl font-normal">FrontDesk</h1>
        </div>
        <div className="flex gap-4 items-center">
          <a href="https://github.com/pedroscosta/front-desk">
            <GitHub className="size-5" />
          </a>
          <a href="https://x.com/frontdeskhq">
            <XformerlyTwitter className="size-5" />
          </a>
        </div>
      </div>
      <div className="flex-1 w-screen flex items-center justify-center relative">
        <Dither
          waveColor={[0.5, 0.5, 0.5]}
          disableAnimation={false}
          enableMouseInteraction={false}
          colorNum={4}
          waveAmplitude={0.3}
          waveFrequency={3}
          waveSpeed={0.05}
        />
        <WaitlistForm />
      </div>
    </div>
  );
}
