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
import {
  threadFixtureSchema,
  type ThreadFixture,
} from "../../schema/thread-fixture.js";

export type CreatedThreadResult = {
  id: string;
  title: string;
  shortId: number | null;
  url: string;
};

export type FailedThreadResult = {
  index: number;
  title: string;
  error: string;
};

export type ThreadCreateOutput = {
  created: CreatedThreadResult[];
  failed: FailedThreadResult[];
};

export type ThreadCreateOptions = {
  org?: string;
  fixture?: string;
  title?: string;
  author?: string;
  message?: string;
  failFast?: boolean;
  verbose?: boolean;
};

const logVerbose = (verbose: boolean, message: string) => {
  if (verbose) {
    console.error(message);
  }
};

// Load raw fixture entries without validating them — each entry is validated
// per-item inside the creation loop so one bad fixture doesn't abort the batch.
const loadRawFixtures = async (
  options: ThreadCreateOptions,
): Promise<unknown[]> => {
  if (options.fixture) {
    const raw = await readFile(options.fixture, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  return [
    {
      title: options.title,
      author: options.author,
      message: options.message,
    },
  ];
};

const fixtureTitle = (raw: unknown): string => {
  if (raw && typeof raw === "object" && "title" in raw) {
    const { title } = raw as { title?: unknown };
    if (typeof title === "string" && title.trim()) return title;
  }
  return "(invalid fixture)";
};

const formatError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
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
    organizationId,
    title: fixture.title,
    message: fixture.message,
    author: {
      id: fdAuthorMetaId(organizationId, fixture.author),
      name: fixture.author,
    },
  });

  return {
    id: thread.id,
    title: thread.name,
    shortId: thread.shortId ?? null,
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
  options: ThreadCreateOptions,
): Promise<{ output: ThreadCreateOutput; exitCode: number }> => {
  assertLocalhostApiUrl(getApiUrl());

  const orgRef = options.org ?? getDefaultOrg();
  if (!orgRef) {
    throw new Error(
      "Organization is required (--org or FD_DEV_ORG environment variable)",
    );
  }

  const rawFixtures = await loadRawFixtures(options);
  const { id: organizationId, slug: orgSlug } =
    await resolveOrganization(orgRef);
  const webUrl = getWebUrl();

  logVerbose(
    options.verbose ?? false,
    `Seeding ${rawFixtures.length} thread(s) into org ${orgSlug} (${organizationId})`,
  );

  const output: ThreadCreateOutput = { created: [], failed: [] };

  for (const [index, raw] of rawFixtures.entries()) {
    const parsed = threadFixtureSchema.safeParse(raw);
    if (!parsed.success) {
      const failure: FailedThreadResult = {
        index,
        title: fixtureTitle(raw),
        error: formatError(parsed.error),
      };
      output.failed.push(failure);
      logVerbose(
        options.verbose ?? false,
        `Failed thread ${index} (${failure.title}): ${failure.error}`,
      );

      if (options.failFast) {
        break;
      }
      continue;
    }

    const fixture = parsed.data;
    try {
      const created = await createOneThread({
        organizationId,
        orgSlug,
        webUrl,
        fixture,
      });
      output.created.push(created);
      logVerbose(
        options.verbose ?? false,
        `Created thread ${created.id}: ${created.title}`,
      );
    } catch (error) {
      const failure: FailedThreadResult = {
        index,
        title: fixture.title,
        error: formatError(error),
      };
      output.failed.push(failure);
      logVerbose(
        options.verbose ?? false,
        `Failed thread ${index} (${fixture.title}): ${failure.error}`,
      );

      if (options.failFast) {
        break;
      }
    }
  }

  return {
    output,
    exitCode: output.failed.length > 0 ? 1 : 0,
  };
};
