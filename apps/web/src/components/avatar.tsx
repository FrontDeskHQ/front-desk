import {
  Avatar as BaseAvatar,
  AvatarFallback as BaseAvatarFallback,
  AvatarImage as BaseAvatarImage,
} from "@workspace/ui/components/avatar";
import type { AvatarProps } from "~/types/avatar";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export function Avatar({ type, src, alt, size = "md", fallback }: AvatarProps) {
  const isOrg = type === "org";
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-7 h-7",
    lg: "w-10 h-10",
  };

  return (
    <div className="flex flex-row flex-wrap items-center gap-12">
      <BaseAvatar
        className={`${sizeClasses[size]} ${isOrg ? " rounded-md" : ""}`}
      >
        <BaseAvatarImage src={src} alt={alt} />
        <BaseAvatarFallback className="text-md text-black bg-white scale-100">
          {typeof fallback === "string" ? getInitials(fallback) : fallback}
        </BaseAvatarFallback>
      </BaseAvatar>
    </div>
  );
}

export default Avatar;
