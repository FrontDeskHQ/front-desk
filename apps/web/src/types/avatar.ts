import type React from "react";

export interface AvatarProps {
  type: "user" | "org";
  src?: string;
  alt?: string;
  size?: "sm" | "md" | "lg";
  fallback: React.ReactNode;
}
