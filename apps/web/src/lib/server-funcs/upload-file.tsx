import { S3Client } from "@bradenmacdonald/s3-lite-client";
import { createServerFn } from "@tanstack/react-start";
import { ulid } from "ulid";
import { z } from "zod";

const uploadFileSchema = z.object({
  file: z.instanceof(File),
  path: z.string(),
});

const s3client = new S3Client({
  accessKey: process.env.CF_R2_ACCESS_KEY,
  bucket: "frontdesk-public",
  endPoint: "https://1aabb0295aae6a4611cda28bd051adbf.r2.cloudflarestorage.com",
  region: "auto",
  secretKey: process.env.CF_R2_SECRET_KEY,
});

export const uploadFile = createServerFn({
  method: "POST",
})
  .inputValidator(z.instanceof(FormData))
  .handler(async ({ data: formData }) => {
    const { file, path } = uploadFileSchema.parse(
      Object.fromEntries(formData.entries())
    );

    const sanitizedPath = path.replace(/\/+$/, "");
    const fullPath = `${sanitizedPath}/${ulid().toLowerCase()}`;
    await s3client.putObject(fullPath, file.stream());

    const baseUrl = process.env.CF_R2_BASE_URL;
    if (!baseUrl) {
      throw new Error("CF_R2_BASE_URL is not configured");
    }

    const fileUrl = new URL(fullPath, baseUrl).toString();

    return fileUrl;
  });
