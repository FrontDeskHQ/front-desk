import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useCommand } from "../../hooks";

export const RootCommands = () => {
  const navigate = useNavigate();

  useCommand({
    id: "go-to-threads",
    label: "Go to Threads",
    icon: <ArrowRight />,
    group: "Navigation",
    onSelect: () => {
      navigate({ to: "/app/threads" });
    },
  });

  useCommand({
    id: "go-to-settings",
    label: "Go to Settings",
    icon: <ArrowRight />,
    group: "Navigation",
    onSelect: () => {
      navigate({ to: "/app/settings" });
    },
  });

  return null;
};
