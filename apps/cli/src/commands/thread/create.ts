import { readFile } from "node:fs/promises";

import { fdAuthorMetaId } from "../../lib/author.js";
import {
  assertLocalhostApiUrl,
  getApiUrl,
  getDefaultOrg,
  getWebUrl,
} from "../../lib/env.js";
import { fetchClient } from "../../lib/live-state.js";
import { resolveOrganization } from "../../lib/org.js";
import { buildThreadUrl } from "../../lib/thread-url.js";
import { threadFixtureSchema } from "../../schema/thread-fixture.js";
import type { ThreadFixture } from "../../schema/thread-fixture.js";

export interface CreatedThreadResult {
  id: string;
  title: string;
  shortId: number | null;
  url: string;
}

export interface FailedThreadResult {
  index: number;
  title: string;
  error: string;
}

export interface ThreadCreateOutput {
  created: CreatedThreadResult[];
  failed: FailedThreadResult[];
}

export interface ThreadCreateOptions {
  org?: string;
  fixture?: string;
  title?: string;
  author?: string;
  message?: string;
  failFast?: boolean;
  verbose?: boolean;
}

const logVerbose = (verbose: boolean, message: string) => {
  if (verbose) {
    console.error(message);
  }
};

// Load raw fixture entries without validating them — each entry is validated
// per-item inside the creation loop so one bad fixture doesn't abort the batch.
const loadRawFixtures = async (
  options: ThreadCreateOptions
): Promise<unknown[]> => {
  if (options.fixture) {
    const raw = await readFile(options.fixture, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  return [
    {
      author: options.author,
      message: options.message,
      title: options.title,
    },
  ];
};

const fixtureTitle = (raw: unknown): string => {
  if (raw && typeof raw === "object" && "title" in raw) {
    const { title } = raw as { title?: unknown };
    if (typeof title === "string" && title.trim()) {
      return title;
    }
  }
  return "(invalid fixture)";
};

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const createOneThread = async ({
  organizationId,
  orgSlug,
  webUrl,
  fixture,
}: {
  organizationId: string;
  orgSlug: string;
  webUrl: string;
  fixture: ThreadFixture;
}): Promise<CreatedThreadResult> => {
  const thread = await fetchClient.mutate.thread.create({
    author: {
      id: fdAuthorMetaId(organizationId, fixture.author),
      name: fixture.author,
    },
    message: fixture.message,
    organizationId,
    title: fixture.title,
  });

  return {
    id: thread.id,
    shortId: thread.shortId ?? null,
    title: thread.name,
    url: buildThreadUrl({
      webUrl,
      orgSlug,
      threadId: thread.id,
      shortId: thread.shortId ?? null,
      title: thread.name,
    }),
  };
};

export const runThreadCreate = async (
  options: ThreadCreateOptions
): Promise<{ output: ThreadCreateOutput; exitCode: number }> => {
  assertLocalhostApiUrl(getApiUrl());

  const orgRef = options.org ?? getDefaultOrg();
  if (!orgRef) {
    throw new Error(
      "Organization is required (--org or FD_DEV_ORG environment variable)"
    );
  }

  const rawFixtures = await loadRawFixtures(options);
  const { id: organizationId, slug: orgSlug } =
    await resolveOrganization(orgRef);
  const webUrl = getWebUrl();

  logVerbose(
    options.verbose ?? false,
    `Seeding ${rawFixtures.length} thread(s) into org ${orgSlug} (${organizationId})`
  );

  const output: ThreadCreateOutput = { created: [], failed: [] };

  for (const [index, raw] of rawFixtures.entries()) {
    const parsed = threadFixtureSchema.safeParse(raw);
    if (!parsed.success) {
      const failure: FailedThreadResult = {
        error: formatError(parsed.error),
        index,
        title: fixtureTitle(raw),
      };
      output.failed.push(failure);
      logVerbose(
        options.verbose ?? false,
        `Failed thread ${index} (${failure.title}): ${failure.error}`
      );

      if (options.failFast) {
        break;
      }
      continue;
    }

    const fixture = parsed.data;
    try {
      const created = await createOneThread({
        fixture,
        orgSlug,
        organizationId,
        webUrl,
      });
      output.created.push(created);
      logVerbose(
        options.verbose ?? false,
        `Created thread ${created.id}: ${created.title}`
      );
    } catch (error) {
      const failure: FailedThreadResult = {
        error: formatError(error),
        index,
        title: fixture.title,
      };
      output.failed.push(failure);
      logVerbose(
        options.verbose ?? false,
        `Failed thread ${index} (${fixture.title}): ${failure.error}`
      );

      if (options.failFast) {
        break;
      }
    }
  }

  return {
    exitCode: output.failed.length > 0 ? 1 : 0,
    output,
  };
};
