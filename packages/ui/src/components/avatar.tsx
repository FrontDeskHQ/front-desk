"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { Input } from "@workspace/ui/components/input";
import { cn } from "@workspace/ui/lib/utils";
import { cva } from "class-variance-authority";
import { Pencil } from "lucide-react";
import { useState } from "react";

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

interface AvatarProps {
  type: "user" | "org";
  src?: string;
  alt?: string;
  size?: "sm" | "md" | "lg";
  fallback: React.ReactNode;
}

const avatarVariants = cva("", {
  variants: {
    size: {
      sm: "w-4 h-4",
      md: "w-7 h-7",
      lg: "w-10 h-10",
    },
    type: {
      user: "rounded-full",
      org: "rounded-md",
    },
  },
  defaultVariants: {
    size: "md",
    type: "user",
  },
});

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function Avatar({ type, src, alt, size, fallback }: AvatarProps) {
  return (
    <div className="flex flex-row flex-wrap items-center gap-12">
      <BaseAvatar className={avatarVariants({ size, type })}>
        <BaseAvatarImage src={src} alt={alt} />
        <BaseAvatarFallback className="text-md text-black bg-white scale-100">
          {typeof fallback === "string" ? getInitials(fallback) : fallback}
        </BaseAvatarFallback>
      </BaseAvatar>
    </div>
  );
}

interface AvatarUploadProps extends AvatarProps {
  onFileChange?: (file: File | undefined) => void;
}

function AvatarUpload({
  type,
  src,
  alt,
  fallback,
  onFileChange,
}: AvatarUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
      onFileChange?.(file);

      // Cleanup the object URL when component unmounts
      return () => URL.revokeObjectURL(objectUrl);
    } else {
      setPreview(null);
      onFileChange?.(undefined);
    }
  };

  return (
    <div className="relative group cursor-pointer">
      <Avatar
        type={type}
        src={preview || src}
        alt={alt}
        size="lg"
        fallback={fallback}
      />
      <Input
        type="file"
        onChange={handleFileChange}
        accept="image/*"
        className="absolute inset-0 opacity-0 cursor-pointer"
        aria-label={`Upload ${type} avatar`}
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

