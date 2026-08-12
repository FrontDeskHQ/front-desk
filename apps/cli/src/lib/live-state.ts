import { createClient as createFetchClient } from "@live-state/sync/client/fetch";
import type { Router } from "api/router";
import { schema } from "api/schema";

import type { Profile } from "./config.js";

/**
 * A client bound to one profile. The private API key it presents determines the
 * organization every request acts on, so nothing here names an organization.
 */
export const createClient = (profile: Profile) =>
  createFetchClient<Router>({
    credentials: async () => ({
      authorization: `Bearer ${profile.key}`,
    }),
    schema,
    url: profile.apiUrl,
  });

export type FdClient = ReturnType<typeof createClient>;
