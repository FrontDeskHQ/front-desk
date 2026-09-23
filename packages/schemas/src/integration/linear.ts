import { z } from "zod";

export const linearTeamSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
});

export const linearIntegrationSchema = z
  .object({
    csrfToken: z.string().optional(),
    defaultTeamId: z.string().min(1).optional(),
    teams: z.array(linearTeamSchema).default([]),
    workspaceId: z.string().min(1).optional(),
    workspaceName: z.string().min(1).optional(),
  })
  .superRefine(({ defaultTeamId, teams }, ctx) => {
    if (defaultTeamId && !teams.some((team) => team.id === defaultTeamId)) {
      ctx.addIssue({
        code: "custom",
        message: "Default team must belong to the connected workspace",
        path: ["defaultTeamId"],
      });
    }
  });

export type LinearIntegrationConfig = z.infer<typeof linearIntegrationSchema>;
