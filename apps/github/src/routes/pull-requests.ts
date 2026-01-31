import Elysia from "elysia";
import { z } from "zod";
import { fetchPullRequests } from "../lib/github";

const getPullRequestsQuerySchema = z.object({
  installation_id: z.coerce.number().positive("Invalid installation_id"),
  owner: z.string().min(1, "Missing owner"),
  repo: z.string().min(1, "Missing repo"),
  state: z.enum(["open", "closed", "all"]).default("open"),
});

export const pullRequestsRoutes = new Elysia({
  prefix: "/api/pull-requests",
}).get("/", async ({ query, set }) => {
  const parsed = getPullRequestsQuerySchema.safeParse(query);

  if (!parsed.success) {
    set.status = 400;
    return { error: parsed.error.issues[0]?.message ?? "Invalid parameters" };
  }

  const { installation_id, owner, repo, state } = parsed.data;
  const installationId = installation_id;

  try {
    const pullRequests = await fetchPullRequests(
      installationId,
      owner,
      repo,
      state
    );
    return { pullRequests, count: pullRequests.length };
  } catch (error) {
    console.error("Error fetching pull requests:", error);
    set.status = 500;
    return { error: "Failed to fetch pull requests" };
  }
});
