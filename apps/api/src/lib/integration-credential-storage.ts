import { createServerDB } from "@live-state/sync/server";

import { schema } from "../live-state/schema";
import { storage } from "../live-state/storage";

/** Server-only credential repository with transactional mutation support. */
export const integrationCredentialStorage = createServerDB(storage, schema);
