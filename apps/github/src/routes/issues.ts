import Elysia from "elysia";
import { z } from "zod";
import { createIssue, fetchIssues } from "../lib/github";

const getIssuesQuerySchema = z.object({
  installation_id: z.coerce.number().positive("Invalid installation_id"),
  owner: z.string().min(1, "Missing owner"),
  repo: z.string().min(1, "Missing repo"),
  state: z.enum(["open", "closed", "all"]).default("open"),
});

const createIssueBodySchema = z.object({
  installation_id: z.coerce.number().positive("Invalid installation_id"),
  owner: z.string().min(1, "Missing owner"),
  repo: z.string().min(1, "Missing repo"),
  title: z.string().min(1, "Missing title"),
  body: z.string().optional(),
});

export const issuesRoutes = new Elysia({ prefix: "/api/issues" })
  .get("/", async ({ query, set }) => {
    const parsed = getIssuesQuerySchema.safeParse(query);

    if (!parsed.success) {
      set.status = 400;
      return { error: parsed.error.issues[0]?.message ?? "Invalid parameters" };
    }

    const { installation_id, owner, repo, state } = parsed.data;
    const installationId = Number.parseInt(installation_id, 10);

    if (Number.isNaN(installationId)) {
      set.status = 400;
      return { error: "Invalid installation_id" };
    }

    try {
      const issues = await fetchIssues(installationId, owner, repo, state);
      return { issues, count: issues.length };
    } catch (error) {
      console.error("Error fetching issues:", error);
      set.status = 500;
      return { error: "Failed to fetch issues" };
    }
  })
  .post("/", async ({ body, set }) => {
    const parsed = createIssueBodySchema.safeParse(body);

    if (!parsed.success) {
      set.status = 400;
      return {
        error: parsed.error.issues[0]?.message ?? "Invalid request body",
      };
    }

    const {
      installation_id,
      owner,
      repo,
      title,
      body: issueBody,
    } = parsed.data;
    const installationId = Number.parseInt(installation_id, 10);

    if (Number.isNaN(installationId)) {
      set.status = 400;
      return { error: "Invalid installation_id" };
    }

    try {
      const issue = await createIssue(
        installationId,
        owner,
        repo,
        title,
        issueBody ?? ""
      );
      set.status = 201;
      return { issue };
    } catch (error) {
      console.error("Error creating issue:", error);
      set.status = 500;
      return { error: "Failed to create issue" };
    }
  });
