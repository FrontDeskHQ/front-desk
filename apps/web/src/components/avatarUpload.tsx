import { Input } from "@workspace/ui/components/input";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { Avatar } from "~/components/avatar";
import type { AvatarProps } from "~/types/avatar";

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

export default AvatarUpload;
