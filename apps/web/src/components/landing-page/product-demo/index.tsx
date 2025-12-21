import { DashedPattern } from "@workspace/ui/components/surface";
import { BookOpenText, Inbox } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { demoThreads } from "./mock/data";
import { MockAppFrame } from "./mock/mock-app-frame";
import { MockPortalPage } from "./mock/pages/portal-page";
import { MockThreadsPage } from "./mock/pages/threads-page";

const SLIDE_DURATION_MS = 10_000;

type Slide = {
  id: number;
  label: string;
  icon: typeof Inbox;
  content: React.ReactNode;
};

const slides: Slide[] = [
  {
    id: 0,
    label: "Unified inbox",
    icon: Inbox,
    content: <MockThreadsPage threads={demoThreads} />,
  },
  {
    id: 1,
    label: "Public support",
    icon: BookOpenText,
    content: <MockPortalPage threads={demoThreads} />,
  },
];

export const ProductDemo = () => {
  const [activeSlide, setActiveSlide] = useState(0);
  const [progress, setProgress] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const handleSlideClick = (slideId: number) => {
    setActiveSlide(slideId);
    setProgress(0);
    startTimeRef.current = Date.now();
  };

  useEffect(() => {
    // Clear existing timeout and animation frame
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Reset progress when slide changes
    setProgress(0);
    startTimeRef.current = Date.now();

    // Animate progress using requestAnimationFrame
    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const newProgress = Math.min((elapsed / SLIDE_DURATION_MS) * 100, 100);
      setProgress(newProgress);

      if (newProgress < 100) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    // Auto-advance slides
    timeoutRef.current = setTimeout(() => {
      setActiveSlide((prev) => (prev + 1) % slides.length);
    }, SLIDE_DURATION_MS);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [activeSlide]);

  return (
    <section
      id="features"
      className="grid grid-cols-2 col-span-full border-x scroll-mt-15"
    >
      {slides.map((slide, index) => {
        const Icon = slide.icon;
        const isActive = activeSlide === index;

        return (
          <button
            key={slide.id}
            type="button"
            onClick={() => handleSlideClick(index)}
            className={`
              border-y flex px-4 py-6 gap-2 justify-center items-center relative
              transition-colors duration-200
              ${index === 0 ? "border-r" : ""}
              ${isActive ? "bg-background-secondary/50" : "bg-transparent hover:bg-background-secondary/30"}
            `}
            aria-label={`Switch to ${slide.label} slide`}
            aria-pressed={isActive}
          >
            <Icon
              className={`size-6 stroke-[1.2] transition-colors ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`}
            />
            <div
              className={`text-lg transition-colors ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {slide.label}
            </div>
            {isActive && (
              <div
                className="absolute bottom-0 left-0 h-px bg-foreground-secondary"
                style={{ width: `${100 - progress}%` }}
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
      <div className="col-span-full -mx-6 w-[calc(100%+var(--spacing)*12)]">
        <div className="relative w-full aspect-video border bg-background-primary overflow-hidden isolate p-2">
          <MockAppFrame showSidebar={activeSlide === 0}>
            {slides[activeSlide].content}
          </MockAppFrame>
          <DashedPattern className="-z-10 absolute inset-0 text-foreground-tertiary/65" />
        </div>
      </div>
    </section>
  );
};
