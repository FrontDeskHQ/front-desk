"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { SidebarMenuButton } from "@workspace/ui/components/sidebar";
import { useKeybind } from "@workspace/ui/hooks/use-keybind";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const themes = [
  { icon: Sun, label: "Light", value: "light" },
  { icon: Moon, label: "Dark", value: "dark" },
  { icon: Monitor, label: "System", value: "system" },
] as const;

const THEME_SWITCHER_KEYBIND = "l";

export const ThemeSwitcher = () => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const currentThemeIndex = themes.findIndex(
    (themeOption) => themeOption.value === theme
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useKeybind(
    THEME_SWITCHER_KEYBIND,
    (event) => {
      event.preventDefault();
      const nextTheme =
        themes[(currentThemeIndex + 1) % themes.length] ?? themes[0];
      setTheme(nextTheme.value);
    },
    [currentThemeIndex],
    { enabled: mounted }
  );

  if (!mounted) {
    return (
      <SidebarMenuButton
        size="lg"
        className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
      >
        <Monitor className="size-4" />
        <span>Theme</span>
      </SidebarMenuButton>
    );
  }

  const currentTheme = themes[currentThemeIndex] ?? themes[2];
  const CurrentIcon = currentTheme.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <CurrentIcon className="size-4" />
          <span>Theme</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            setTheme(value);
          }}
        >
          {themes.map((themeOption) => {
            const Icon = themeOption.icon;
            return (
              <DropdownMenuRadioItem
                key={themeOption.value}
                value={themeOption.value}
              >
                <Icon className="size-4" />
                <span>{themeOption.label}</span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
