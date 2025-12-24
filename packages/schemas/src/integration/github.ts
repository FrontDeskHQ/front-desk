import { z } from "zod";

export const githubIntegrationSchema = z.object({
  csrfToken: z.string().optional(),
  repositoryOwner: z.string().optional(),
  repositoryName: z.string().optional(),
  accessToken: z.string().optional(), // Temporary, used during OAuth flow
  pendingRepos: z
    .array(
      z.object({
        fullName: z.string(),
        owner: z.string(),
        name: z.string(),
      }),
    )
    .optional(), // Temporary, used during repo selection
  webhookSecret: z.string().optional(),
  selectedEvents: z
    .array(z.enum(["issues", "pull_request"]))
    .default(["issues", "pull_request"])
    .optional(),
});

export type GitHubIntegrationConfig = z.infer<typeof githubIntegrationSchema>;
