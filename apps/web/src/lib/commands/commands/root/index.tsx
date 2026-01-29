import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { useCommand } from "../../hooks";

// Memoize icons outside component to ensure stable references
const arrowRightIcon = <ArrowRight />;

export const RootCommands = () => {
  const navigate = useNavigate();

  // Memoize command objects to prevent unnecessary re-registrations
  const goToThreadsCommand = useMemo(
    () => ({
      id: "go-to-threads",
      label: "Go to Threads",
      icon: arrowRightIcon,
      group: "Navigation",
      onSelect: () => {
        navigate({ to: "/app/threads" });
      },
    }),
    [navigate],
  );

  const goToSettingsCommand = useMemo(
    () => ({
      id: "go-to-settings",
      label: "Go to Settings",
      icon: arrowRightIcon,
      group: "Navigation",
      onSelect: () => {
        navigate({ to: "/app/settings" });
      },
    }),
    [navigate],
  );

  // Pass stable primitive dependencies - command.id is already included internally
  useCommand(goToThreadsCommand, []);
  useCommand(goToSettingsCommand, []);

  return null;
};
