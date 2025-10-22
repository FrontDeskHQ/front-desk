"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { Input } from "@workspace/ui/components/input";
import { cn } from "@workspace/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";

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
        "bg-indigo-400 flex size-full items-center justify-center rounded-full text-xs scale-75",
        className,
      )}
      {...props}
    />
  );
}

const avatarVariants = cva("", {
  variants: {
    size: {
      sm: "size-4",
      md: "size-5",
      lg: "size-7",
      xl: "size-10",
      xxl: "size-24",
    },
    variant: {
      user: "rounded-full",
      org: "rounded-md",
    },
  },
  defaultVariants: {
    size: "md",
    variant: "user",
  },
});

const avatarFallbackVariants = cva("text-black bg-white select-none", {
  variants: {
    size: {
      sm: "scale-50 text-[0.5rem]",
      md: "scale-75 text-[0.625rem]",
      lg: "scale-90 text-xs",
      xl: "scale-100 text-sm",
      xxl: "scale-200 text-lg",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

interface AvatarProps extends VariantProps<typeof avatarVariants> {
  className?: string;
  src?: string | null;
  alt?: string | null;
  fallback: React.ReactNode;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Avatar({ className, src, alt, variant, size, fallback }: AvatarProps) {
  return (
    <BaseAvatar className={avatarVariants({ size, variant, className })}>
      <BaseAvatarImage src={src ?? undefined} alt={alt ?? undefined} />
      <BaseAvatarFallback className={avatarFallbackVariants({ size })}>
        {typeof fallback === "string" ? getInitials(fallback) : fallback}
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
  BaseAvatarImage
};

