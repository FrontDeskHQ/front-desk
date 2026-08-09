import { beforeEach, describe, expect, it, vi } from "vitest";

import { defineRetrievalHint } from "./define-retrieval-hint";
import type { RetrievalHintSpec } from "./define-retrieval-hint";

vi.mock("@workspace/utils/logging", () => ({
  createLogger: () => ({
    emit: vi.fn(),
    error: vi.fn(),
    set: vi.fn(),
    warn: vi.fn(),
  }),
}));

type Hit = { score: number; id: string };

const writeHint = vi.fn();

const context = (options: {
  thread?: Record<string, unknown>;
  summary?: Record<string, unknown> | null;
  embedding?: number[] | null;
}) => {
  const thread = {
    id: "thread_1",
    organizationId: "org_1",
    ...options.thread,
  };
  const outputs: Record<string, unknown> = {
    embed: {
      embedding: "embedding" in options ? options.embedding : [0.1, 0.2],
    },
    summarize:
      options.summary === null
        ? undefined
        : { summary: options.summary ?? { title: "Broken export" } },
  };
  return {
    context: {
      getProcessorOutput: (name: string) => outputs[name],
      jobId: "job_1",
    },
    run: { writeHint },
    thread,
    threadId: thread.id,
    // The fakes above cover exactly the surface `defineRetrievalHint` touches;
    // the real types carry far more that this module never reads.
  } as never;
};

const spec = (
  overrides: Partial<RetrievalHintSpec<"related_prs", Hit>> = {}
): RetrievalHintSpec<"related_prs", Hit> => ({
  count: (evidence) => evidence.prs.length,
  kind: "related_prs",
  requiresEmbedding: true,
  retiredBy: "externalPrId",
  retrieve: async () => [{ id: "pr_1", score: 0.9 }],
  select: (hits) =>
    hits.length > 0
      ? {
          prs: hits.map((hit) => ({
            externalKey: `github:acme/web#${hit.id}`,
            number: 1,
            prId: hit.id,
            repoFullName: "acme/web",
            score: hit.score,
            title: "Fix export",
            url: `https://github.com/acme/web/pull/1`,
          })),
        }
      : null,
  tuning: { limit: 5, scoreThreshold: 0.85 },
  ...overrides,
});

beforeEach(() => {
  writeHint.mockReset();
});

describe("retrieval hint retirement", () => {
  it("clears the slot and skips retrieval once the thread links the entity", async () => {
    const retrieve = vi.fn();
    const processor = defineRetrievalHint(spec({ retrieve }));

    const result = await processor.execute(
      context({ thread: { externalPrId: "ext_1" } })
    );

    expect(retrieve).not.toHaveBeenCalled();
    expect(writeHint).toHaveBeenCalledWith(
      "related_prs",
      null,
      expect.any(String)
    );
    expect(result).toMatchObject({ data: { evidence: null }, success: true });
  });

  it("keeps a retired thread's hash stable across summary churn", () => {
    const processor = defineRetrievalHint(spec());
    const thread = { externalPrId: "ext_1" };

    const first = processor.computeHash(
      context({ summary: { title: "one" }, thread })
    );
    const second = processor.computeHash(
      context({ summary: { title: "two" }, thread })
    );

    expect(first).toBe(second);
  });

  it("opts a retiring hint out of the dependencies-skipped fast path in both directions", () => {
    const processor = defineRetrievalHint(spec());

    // Linked: the hint must re-run to clear itself.
    expect(
      processor.runsWhenDependenciesSkipped?.(
        context({ thread: { externalPrId: "ext_1" } })
      )
    ).toBe(true);
    // Unlinked: it must re-run to restore the hint the link cleared. Linking
    // does not change the embedding, so the fast path would otherwise leave the
    // slot empty forever.
    expect(processor.runsWhenDependenciesSkipped?.(context({}))).toBe(true);
  });

  it("leaves a hint with no retiring column on the dependencies-skipped fast path", () => {
    const processor = defineRetrievalHint(spec({ retiredBy: undefined }));

    expect(processor.runsWhenDependenciesSkipped?.(context({}))).toBe(false);
  });

  it("never retires a hint whose spec declares no retiring column", async () => {
    const processor = defineRetrievalHint(spec({ retiredBy: undefined }));

    await processor.execute(context({ thread: { externalPrId: "ext_1" } }));

    expect(writeHint).toHaveBeenCalledWith(
      "related_prs",
      expect.objectContaining({ prs: expect.any(Array) }),
      expect.any(String)
    );
  });
});

describe("retrieval hint clearing", () => {
  it("clears the slot when retrieval genuinely finds nothing", async () => {
    const processor = defineRetrievalHint(spec({ retrieve: async () => [] }));

    await processor.execute(context({}));

    expect(writeHint).toHaveBeenCalledWith(
      "related_prs",
      null,
      expect.any(String)
    );
  });

  it("leaves the prior hint untouched when retrieval fails", async () => {
    const processor = defineRetrievalHint(
      spec({
        retrieve: async () => {
          throw new Error("qdrant unreachable");
        },
      })
    );

    const result = await processor.execute(context({}));

    expect(writeHint).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      error: "qdrant unreachable",
      success: false,
    });
  });

  it("leaves the prior hint untouched when the embedding is missing", async () => {
    const processor = defineRetrievalHint(spec());

    const result = await processor.execute(context({ embedding: null }));

    expect(writeHint).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false });
  });

  it("runs without an embedding when the spec does not require one", async () => {
    const processor = defineRetrievalHint(
      spec({ requiresEmbedding: false, retrieve: async () => [] })
    );

    const result = await processor.execute(context({ embedding: null }));

    expect(result).toMatchObject({ success: true });
    expect(writeHint).toHaveBeenCalled();
  });
});

describe("retrieval hint invalidation", () => {
  it("changes the hash when the summary changes", () => {
    const processor = defineRetrievalHint(spec());

    const first = processor.computeHash(context({ summary: { title: "one" } }));
    const second = processor.computeHash(
      context({ summary: { title: "two" } })
    );

    expect(first).not.toBe(second);
  });

  it("hashes a missing summary to a stable value", () => {
    const processor = defineRetrievalHint(spec());

    const first = processor.computeHash(context({ summary: null }));
    const second = processor.computeHash(context({ summary: null }));

    expect(first).toBe(second);
  });

  it("writes the slot under the same hash computeHash reported", async () => {
    const processor = defineRetrievalHint(spec());
    const input = { summary: { title: "Broken export" } };

    const expected = processor.computeHash(context(input));
    await processor.execute(context(input));

    expect(writeHint).toHaveBeenCalledWith(
      "related_prs",
      expect.anything(),
      expected
    );
  });
});
