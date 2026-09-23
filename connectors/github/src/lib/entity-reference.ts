import { z } from "zod";

export const githubEntityRefSchema = z.object({
  number: z.number().int().positive(),
  owner: z.string().min(1),
  repo: z.string().min(1),
});

export type GitHubEntityReference = z.infer<typeof githubEntityRefSchema>;

interface GitHubEntityReferenceInput {
  externalRef: unknown;
  number?: number;
  repoFullName?: string;
}

/** Resolve the canonical provider reference, falling back during migration. */
export const resolveGitHubEntityReference = (
  entity: GitHubEntityReferenceInput
): GitHubEntityReference | null => {
  const canonical = githubEntityRefSchema.safeParse(entity.externalRef);
  if (canonical.success) {
    return canonical.data;
  }

  if (!(entity.number && entity.repoFullName)) {
    return null;
  }
  const parts = entity.repoFullName.split("/");
  if (parts.length !== 2 || !(parts[0] && parts[1])) {
    return null;
  }

  const legacy = githubEntityRefSchema.safeParse({
    number: entity.number,
    owner: parts[0],
    repo: parts[1],
  });
  return legacy.success ? legacy.data : null;
};
