import { DashedPattern } from "@workspace/ui/components/surface";
import { BookOpenText, Inbox } from "lucide-react";
import { demoThreads } from "./mock/data";
import { MockAppFrame } from "./mock/mock-app-frame";
import { MockThreadsPage } from "./mock/pages/threads-page";

export const ProductDemo = () => {
  return (
    <section
      id="features"
      className="grid grid-cols-2 col-span-full border-x scroll-mt-15"
    >
      <div className="border-y flex px-4 py-6 gap-2 border-r justify-center items-center">
        <Inbox className="size-6 text-muted-foreground stroke-[1.2]" />
        <div className="text-lg">Unified inbox</div>
      </div>
      <div className="border-y flex px-4 py-6 gap-2 justify-center items-center">
        <BookOpenText className="size-6 text-muted-foreground stroke-[1.2]" />
        <div className="text-lg">Public support</div>
      </div>
      <div className="col-span-full -mx-6 w-[calc(100%+var(--spacing)*12)]">
        <div className="relative w-full aspect-video border bg-background-primary overflow-hidden isolate p-2">
          <MockAppFrame>
            <MockThreadsPage threads={demoThreads} />
          </MockAppFrame>
          <DashedPattern className="-z-10 absolute inset-0 text-foreground-tertiary/65" />
        </div>
      </div>
    </section>
  );
};
