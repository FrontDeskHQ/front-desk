import {
  agentRunForThreadInputSchema,
  appendAgentRunEventsInputSchema,
  completeAgentRunInputSchema,
  latestAgentRunInputSchema,
  listAgentRunsInputSchema,
  runAgentRunForThread,
  runAppendAgentRunEvents,
  runCompleteAgentRun,
  runLatestAgentRunForThread,
  runListAgentRunsForThread,
  runStartAgentRun,
  startAgentRunInputSchema,
} from "../../lib/agent-run-audit";
import {
  authorizeDeveloperAction,
  requireInternalApiKey,
} from "../../lib/authorize";
import { publicRoute } from "../factories";

export const agentRunRoutes = {
  agentRun: publicRoute.withProcedures(({ mutation, query }) => ({
    appendEvents: mutation(appendAgentRunEventsInputSchema).handler(
      async ({ db, req }) => {
        requireInternalApiKey(req.context);
        return runAppendAgentRunEvents(db, req.input);
      }
    ),
    complete: mutation(completeAgentRunInputSchema).handler(
      async ({ db, req }) => {
        requireInternalApiKey(req.context);
        return runCompleteAgentRun(db, req.input);
      }
    ),
    latestForThread: query(latestAgentRunInputSchema).handler(
      async ({ db, req }) => {
        authorizeDeveloperAction(req, req.input.organizationId, {
          action: "agent_run.read",
        });
        return runLatestAgentRunForThread(db, req.input);
      }
    ),
    listForThread: query(listAgentRunsInputSchema).handler(
      async ({ db, req }) => {
        authorizeDeveloperAction(req, req.input.organizationId, {
          action: "agent_run.read",
        });
        return runListAgentRunsForThread(db, req.input);
      }
    ),
    oneForThread: query(agentRunForThreadInputSchema).handler(
      async ({ db, req }) => {
        authorizeDeveloperAction(req, req.input.organizationId, {
          action: "agent_run.read",
        });
        return runAgentRunForThread(db, req.input);
      }
    ),
    start: mutation(startAgentRunInputSchema).handler(async ({ db, req }) => {
      requireInternalApiKey(req.context);
      return runStartAgentRun(db, req.input);
    }),
  })),
};
