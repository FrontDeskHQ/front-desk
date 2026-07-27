import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { useCommand } from "../../hooks";

// Memoize icons outside component to ensure stable references
const arrowRightIcon = <ArrowRight />;

export const RootCommands = () => {
  const navigate = useNavigate();

  useCommand(
    () => ({
      group: "Navigation",
      icon: arrowRightIcon,
      id: "go-to-threads",
      label: "Go to Threads",
      onSelect: () => {
        navigate({ to: "/app/threads" });
      },
    }),
    [navigate]
  );

  useCommand(
    () => ({
      group: "Navigation",
      icon: arrowRightIcon,
      id: "go-to-settings",
      label: "Go to Settings",
      onSelect: () => {
        navigate({ to: "/app/settings" });
      },
    }),
    [navigate]
  );

  return null;
};
