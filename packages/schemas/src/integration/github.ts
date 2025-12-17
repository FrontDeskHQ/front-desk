import { z } from "zod";

export const githubIntegrationSchema = z.object({
  installationId: z.string(),
  repositoryOwner: z.string(),
  repositoryName: z.string(),
  webhookSecret: z.string().optional(),
  selectedEvents: z.array(z.enum(["issues", "pull_request"])).default(["issues", "pull_request"]),
});

export type GitHubIntegrationConfig = z.infer<typeof githubIntegrationSchema>;
