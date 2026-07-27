import { z } from "zod";

export const githubIntegrationSchema = z.object({
  csrfToken: z.string().optional(),
  installationId: z.number().optional(), // GitHub App installation ID
  repos: z
    .array(
      z.object({
        fullName: z.string(),
        owner: z.string(),
        name: z.string(),
      })
    )
    .optional(), // Repositories selected during GitHub App installation
  selectedEvents: z
    .array(z.enum(["issues", "pull_request"]))
    .default(["issues", "pull_request"])
    .optional(),
  webhookSecret: z.string().optional(),
});

export type GitHubIntegrationConfig = z.infer<typeof githubIntegrationSchema>;
