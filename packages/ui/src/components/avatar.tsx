"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { Input } from "@workspace/ui/components/input";
import { cn } from "@workspace/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";

const avatarColorClasses = [
  "bg-rose-300 text-white dark:bg-rose-400 dark:text-white",
  "bg-orange-300 text-white dark:bg-orange-400 dark:text-white",
  "bg-amber-300 text-white dark:bg-amber-400 dark:text-white",
  "bg-emerald-300 text-white dark:bg-emerald-400 dark:text-white",
  "bg-cyan-300 text-white dark:bg-cyan-400 dark:text-white",
  "bg-indigo-300 text-white dark:bg-indigo-400 dark:text-white",
  "bg-fuchsia-300 text-white dark:bg-fuchsia-400 dark:text-white",
];

function BaseAvatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-4 shrink-0 overflow-hidden rounded-full",
        className,
      )}
      {...props}
    />
  );
}

function BaseAvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  );
}

function BaseAvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-indigo-400 flex size-full items-center justify-center text-xs",
        className,
      )}
      {...props}
    />
  );
}

const avatarVariants = cva("", {
  variants: {
    size: {
      sm: "size-3",
      md: "size-4",
      lg: "size-6",
      xl: "size-8",
      xxl: "size-10",
    },
    variant: {
      user: "rounded-full",
      org: "",
    },
  },
  compoundVariants: [
    {
      variant: "org",
      size: ["sm", "md"],
      className: "rounded-sm",
    },
    {
      variant: "org",
      size: ["lg", "xl", "xxl"],
      className: "rounded-md",
    },
  ],
  defaultVariants: {
    size: "md",
    variant: "user",
  },
});

const avatarFallbackVariants = cva("select-none size-full font-medium", {
  variants: {
    size: {
      sm: "text-[0.5rem]",
      md: "text-[0.6rem]",
      lg: "text-base",
      xl: "text-base",
      xxl: "text-2xl",
    },
    variant: {
      user: "rounded-full",
      org: "",
    },
  },
  compoundVariants: [
    {
      variant: "org",
      size: ["sm", "md"],
      className: "rounded-sm",
    },
    {
      variant: "org",
      size: ["lg", "xl", "xxl"],
      className: "rounded-md",
    },
  ],
  defaultVariants: {
    size: "md",
    variant: "user",
  },
});

interface AvatarProps extends VariantProps<typeof avatarVariants> {
  className?: string;
  src?: string | null;
  alt?: string | null;
  fallback: React.ReactNode;
}

function getAvatarCharacter(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return "?";
  }

  const firstCharacter = Array.from(trimmedValue)[0];
  if (!firstCharacter) {
    return "?";
  }

  return firstCharacter.toUpperCase();
}

function getAvatarColorClass(seed: string) {
  let hash = 0;
  for (const character of seed) {
    hash = character.charCodeAt(0) + ((hash << 5) - hash);
  }

  const paletteIndex = Math.abs(hash) % avatarColorClasses.length;
  return avatarColorClasses[paletteIndex];
}

function Avatar({ className, src, alt, variant, size, fallback }: AvatarProps) {
  const fallbackText = typeof fallback === "string" ? fallback : null;
  const fallbackCharacter = fallbackText ? getAvatarCharacter(fallbackText) : fallback;
  const fallbackColorClass = getAvatarColorClass(
    fallbackText ?? alt ?? src ?? "avatar",
  );

  return (
    <BaseAvatar className={avatarVariants({ size, variant, className })}>
      <BaseAvatarImage src={src ?? undefined} alt={alt ?? undefined} />
      <BaseAvatarFallback
        className={cn(
          avatarFallbackVariants({ size, variant }),
          fallbackColorClass,
        )}
      >
        {fallbackCharacter}
      </BaseAvatarFallback>
    </BaseAvatar>
  );
}

interface AvatarUploadProps extends AvatarProps {
  onFileChange?: (file: File | undefined) => void;
}

function AvatarUpload({
  onFileChange,
  src,
  variant,
  ...props
}: AvatarUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
      onFileChange?.(file);
    } else {
      setPreview(null);
      onFileChange?.(undefined);
    }
  };

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <div className="relative group cursor-pointer">
      <Avatar variant={variant} src={preview || src} {...props} />
      <Input
        type="file"
        onChange={handleFileChange}
        accept="image/*"
        className="absolute inset-0 opacity-0 cursor-pointer"
        aria-label={`Upload ${variant} avatar`}
      />
      <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <Pencil className="w-5 h-5 text-white" />
      </div>
    </div>
  );
}

export {
  Avatar,
  AvatarUpload,
  BaseAvatar,
  BaseAvatarFallback,
  BaseAvatarImage,
};
