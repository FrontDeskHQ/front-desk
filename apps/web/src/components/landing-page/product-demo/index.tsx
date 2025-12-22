import { DashedPattern } from "@workspace/ui/components/surface";
import {
  BookOpenText,
  Inbox,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { demoThreads } from "./mock/data";
import { MockAppFrame } from "./mock/mock-app-frame";
import { MockPortalSlide } from "./mock/pages/portal-slide";
import { MockThreadsSlide } from "./mock/pages/threads-slide";

const SLIDE_DURATION_MS = 10_000;
const DEV_CONTROLS_VISIBLE = false; // Set to true to show dev controls
const TIME_STEP_MS = 1_000; // 1 second for advance/rewind

type Slide = {
  id: number;
  label: string;
  icon: typeof Inbox;
  content: (props: {
    elapsedMs: number;
    slideDurationMs: number;
  }) => React.ReactNode;
};

const slides: Slide[] = [
  {
    id: 0,
    label: "Unified inbox",
    icon: Inbox,
    content: ({ elapsedMs, slideDurationMs }) => (
      <MockThreadsSlide
        threads={demoThreads}
        elapsedMs={elapsedMs}
        slideDurationMs={slideDurationMs}
      />
    ),
  },
  {
    id: 1,
    label: "Public support",
    icon: BookOpenText,
    content: ({ elapsedMs, slideDurationMs }) => (
      <MockPortalSlide
        threads={demoThreads}
        elapsedMs={elapsedMs}
        slideDurationMs={slideDurationMs}
      />
    ),
  },
];

export const ProductDemo = () => {
  const [activeSlide, setActiveSlide] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const pausedElapsedRef = useRef<number>(0);

  const handleSlideClick = (slideId: number) => {
    setActiveSlide(slideId);
    setProgress(0);
    pausedElapsedRef.current = 0;
    startTimeRef.current = Date.now();
    setIsPaused(false);
  };

  useEffect(() => {
    // Reset paused elapsed when slide changes
    pausedElapsedRef.current = 0;
  }, [activeSlide]);

  const handlePause = () => {
    setIsPaused(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    pausedElapsedRef.current = Date.now() - startTimeRef.current;
  };

  const handlePlay = () => {
    setIsPaused(false);
    startTimeRef.current = Date.now() - pausedElapsedRef.current;
  };

  const handleAdvance = () => {
    // Get current elapsed time
    const currentElapsed = isPaused
      ? pausedElapsedRef.current
      : Date.now() - startTimeRef.current;

    // Pause if not already paused
    if (!isPaused) {
      setIsPaused(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }

    const newElapsed = Math.min(
      currentElapsed + TIME_STEP_MS,
      SLIDE_DURATION_MS,
    );
    pausedElapsedRef.current = newElapsed;
    const newProgress = (newElapsed / SLIDE_DURATION_MS) * 100;
    setProgress(newProgress);
    startTimeRef.current = Date.now() - pausedElapsedRef.current;

    if (newProgress >= 100) {
      setActiveSlide((prev) => (prev + 1) % slides.length);
    }
  };

  const handleRewind = () => {
    // Get current elapsed time
    const currentElapsed = isPaused
      ? pausedElapsedRef.current
      : Date.now() - startTimeRef.current;

    // Pause if not already paused
    if (!isPaused) {
      setIsPaused(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }

    const newElapsed = Math.max(currentElapsed - TIME_STEP_MS, 0);
    pausedElapsedRef.current = newElapsed;
    const newProgress = (newElapsed / SLIDE_DURATION_MS) * 100;
    setProgress(newProgress);
    startTimeRef.current = Date.now() - pausedElapsedRef.current;
  };

  useEffect(() => {
    // Clear existing timeout and animation frame
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Don't run animation if paused
    if (isPaused) {
      return;
    }

    // Reset progress when slide changes
    if (pausedElapsedRef.current === 0) {
      setProgress(0);
      startTimeRef.current = Date.now();
    } else {
      startTimeRef.current = Date.now() - pausedElapsedRef.current;
    }

    // Animate progress using requestAnimationFrame
    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const newProgress = Math.min((elapsed / SLIDE_DURATION_MS) * 100, 100);
      setProgress(newProgress);

      if (newProgress < 100 && !isPaused) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    // Auto-advance slides
    const remainingTime = SLIDE_DURATION_MS - pausedElapsedRef.current;
    if (remainingTime > 0) {
      timeoutRef.current = setTimeout(() => {
        if (!isPaused) {
          setActiveSlide((prev) => (prev + 1) % slides.length);
        }
      }, remainingTime);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [activeSlide, isPaused]);

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
              border-t flex px-4 py-6 gap-2 justify-center items-center relative
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
      <div className="col-span-full w-full mx-0 xl:-mx-6 xl:w-[calc(100%+var(--spacing)*12)]">
        <div className="relative w-full aspect-video border bg-background-primary overflow-hidden isolate p-2">
          <MockAppFrame showSidebar={activeSlide === 0}>
            {slides[activeSlide].content({
              elapsedMs: (progress / 100) * SLIDE_DURATION_MS,
              slideDurationMs: SLIDE_DURATION_MS,
            })}
          </MockAppFrame>
          <DashedPattern className="-z-10 absolute inset-0 text-foreground-tertiary/65" />
          {DEV_CONTROLS_VISIBLE && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-background-primary/95 backdrop-blur-sm border rounded-lg px-3 py-2 shadow-lg">
              <button
                type="button"
                onClick={handleRewind}
                className="p-1.5 rounded hover:bg-background-secondary transition-colors"
                aria-label="Rewind 1 second"
                tabIndex={0}
              >
                <SkipBack className="size-4" />
              </button>
              <button
                type="button"
                onClick={isPaused ? handlePlay : handlePause}
                className="p-1.5 rounded hover:bg-background-secondary transition-colors"
                aria-label={isPaused ? "Play" : "Pause"}
                tabIndex={0}
              >
                {isPaused ? (
                  <Play className="size-4" />
                ) : (
                  <Pause className="size-4" />
                )}
              </button>
              <button
                type="button"
                onClick={handleAdvance}
                className="p-1.5 rounded hover:bg-background-secondary transition-colors"
                aria-label="Advance 1 second"
                tabIndex={0}
              >
                <SkipForward className="size-4" />
              </button>
              <div className="h-4 w-px bg-border mx-1" />
              <div className="text-xs text-muted-foreground min-w-[60px] text-center">
                {Math.round(((progress / 100) * SLIDE_DURATION_MS) / 1000)}s /{" "}
                {SLIDE_DURATION_MS / 1000}s
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
