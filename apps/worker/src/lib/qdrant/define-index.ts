import { createHash } from "node:crypto";

import { log } from "@workspace/utils/logging";

import { errorFields } from "../logging";
import { qdrantClient } from "./client";

/**
 * One vector index over one entity kind (see [Index](../../../../CONTEXT.md)).
 *
 * Every collection FrontDesk keeps in Qdrant is an instantiation of this module
 * rather than a module of its own: the collection bootstrap, point identity,
 * organization scoping, filter construction, payload decoding and error
 * contract are the same work in every case, and only the descriptor differs.
 *
 * **Error contract.** Everything here throws on a backend failure. An empty
 * result means "nothing matched" and never "the backend is unreachable", so a
 * caller persisting a hint can tell the two apart and never clears a valid lead
 * on a failed search. {@link VectorIndex.ensure} is the one exception — boot
 * wants to decide for itself whether to continue, so it returns a boolean.
 *
 * **Organization scoping** is applied by this module, not by callers.
 */

/** A value a payload field can be matched on. */
type MatchValue = string | number | boolean;

/**
 * Payload-keyed filter. A scalar matches that value; an array matches any of
 * them. Keyed off the payload type so a misspelled field is a type error rather
 * than a filter that silently matches everything.
 */
export type PayloadFilter<TPayload> = {
  [K in keyof TPayload]?: MatchValue | MatchValue[];
};

export interface SearchHit<TPayload> {
  score: number;
  payload: TPayload;
}

export interface SearchOptions<TPayload> {
  organizationId: string;
  limit?: number;
  scoreThreshold?: number;
  /** Extra conditions the hit must satisfy. */
  where?: PayloadFilter<TPayload>;
  /** Conditions that disqualify a hit (e.g. a PR already linked to the thread). */
  exclude?: PayloadFilter<TPayload>;
}

export interface ScrollOptions<TPayload> {
  organizationId: string;
  limit?: number;
  where?: PayloadFilter<TPayload>;
  exclude?: PayloadFilter<TPayload>;
}

export interface CollectionDescriptor<
  TPayload,
  TKeyFields extends keyof TPayload,
  TSparse extends boolean = false,
> {
  /** Qdrant collection name, including its version suffix. */
  name: string;
  dimensions: number;
  /**
   * The fields that identify a point, and how they become a Qdrant point id.
   * Deterministic by construction: re-indexing the same entity overwrites in
   * place instead of accumulating a second point for it.
   *
   * Returns `null` only where the identity itself can be malformed (message
   * ULIDs); callers that must tolerate that use {@link VectorIndex.pointIdFor}.
   */
  key: (fields: Pick<TPayload, TKeyFields>) => string | null;
  payloadIndexes: {
    field: keyof TPayload & string;
    schema: "keyword" | "integer" | "bool";
  }[];
  /**
   * Declare for a hybrid collection: a named `dense` vector plus a `bm25`
   * sparse vector, searched together with reciprocal-rank fusion. Omit for a
   * single unnamed cosine vector.
   */
  sparse?: TSparse;
}

export type UpsertPoint<
  TPayload,
  TSparse extends boolean,
> = TSparse extends true
  ? { vector: number[]; text: string; payload: TPayload }
  : { vector: number[]; payload: TPayload };

export interface VectorIndex<
  TPayload,
  TKeyFields extends keyof TPayload,
  TSparse extends boolean = false,
> {
  readonly name: string;
  readonly dimensions: number;

  /**
   * Create the collection and its payload indexes if absent. Returns whether the
   * collection is usable rather than throwing, so boot can report every
   * collection's readiness before refusing to start.
   */
  ensure(): Promise<boolean>;

  /** The point id for these key fields, or null when the key is malformed. */
  pointIdFor(fields: Pick<TPayload, TKeyFields>): string | null;

  /** The stored payload, or null when this entity was never indexed. */
  get(fields: Pick<TPayload, TKeyFields>): Promise<TPayload | null>;

  upsert(point: UpsertPoint<TPayload, TSparse>): Promise<void>;
  upsertBatch(points: UpsertPoint<TPayload, TSparse>[]): Promise<void>;

  /** Update payload fields in place, without re-embedding. */
  patch(
    fields: Pick<TPayload, TKeyFields>,
    values: Partial<TPayload>
  ): Promise<void>;

  remove(fields: Pick<TPayload, TKeyFields>): Promise<void>;
  /** Remove every point matching a filter (org scoping still applied). */
  removeWhere(options: ScrollOptions<TPayload>): Promise<void>;

  /** Rank points by similarity to a query vector. Throws on backend failure. */
  search(
    vector: number[],
    options: SearchOptions<TPayload>
  ): Promise<SearchHit<TPayload>[]>;

  /**
   * Dense + bm25 with reciprocal-rank fusion. The raw query text is required
   * because the sparse leg matches on terms, not on the vector.
   */
  hybrid(
    query: { vector: number[]; text: string },
    options: SearchOptions<TPayload>
  ): Promise<SearchHit<TPayload>[]>;

  /** Every payload matching a filter, unranked. */
  scroll(options: ScrollOptions<TPayload>): Promise<TPayload[]>;
}

/**
 * Qdrant point ids must be an unsigned integer or a UUID string. Hash the parts
 * that identify an entity and format the digest as a UUID, so the same entity
 * always lands on the same point while two organizations mirroring the same
 * upstream entity never collide.
 */
export const uuidFromParts = (...parts: (string | number)[]): string => {
  const hex = createHash("sha256").update(parts.join(":")).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
};

export class VectorIndexError extends Error {
  readonly collection: string;
  readonly operation: string;

  constructor(collection: string, operation: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`${collection}.${operation} failed: ${detail}`);
    this.name = "VectorIndexError";
    this.collection = collection;
    this.operation = operation;
    this.cause = cause;
  }
}

type QdrantCondition =
  | { key: string; match: { value: MatchValue } }
  | { key: string; match: { any: MatchValue[] } };

const toConditions = <TPayload>(
  filter: PayloadFilter<TPayload> | undefined
): QdrantCondition[] => {
  if (!filter) {
    return [];
  }
  const conditions: QdrantCondition[] = [];
  for (const [field, value] of Object.entries(filter)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      // An empty set constrains nothing; emitting it would match no points.
      if (value.length > 0) {
        conditions.push({ key: field, match: { any: value } });
      }
      continue;
    }
    conditions.push({ key: field, match: { value: value as MatchValue } });
  }
  return conditions;
};

const buildFilter = <TPayload>(options: {
  organizationId: string;
  where?: PayloadFilter<TPayload>;
  exclude?: PayloadFilter<TPayload>;
}) => {
  const must: QdrantCondition[] = [
    { key: "organizationId", match: { value: options.organizationId } },
    ...toConditions(options.where),
  ];
  const mustNot = toConditions(options.exclude);
  return {
    must,
    must_not: mustNot.length > 0 ? mustNot : undefined,
  };
};

export const defineIndex = <
  TPayload extends { organizationId: string },
  TKeyFields extends keyof TPayload,
  TSparse extends boolean = false,
>(
  descriptor: CollectionDescriptor<TPayload, TKeyFields, TSparse>,
  client = qdrantClient
): VectorIndex<TPayload, TKeyFields, TSparse> => {
  const { name, dimensions, sparse } = descriptor;

  const fail = (operation: string, cause: unknown): never => {
    throw new VectorIndexError(name, operation, cause);
  };

  const requirePointId = (
    fields: Pick<TPayload, TKeyFields>,
    operation: string
  ): string => {
    const id = descriptor.key(fields);
    if (!id) {
      return fail(operation, new Error("Point key could not be derived"));
    }
    return id;
  };

  /**
   * Qdrant types the payload as nullable. A point with a missing payload is
   * unusable as evidence, and surfacing it as a TypeError would read to a hint
   * processor as "search failed" and trigger a retry — so drop it instead.
   */
  const decodeHits = (
    points: { id: string | number; score: number; payload?: unknown }[],
    operation: string
  ): SearchHit<TPayload>[] =>
    points.flatMap((point) => {
      const payload = point.payload as TPayload | null | undefined;
      if (!payload) {
        log.warn({
          action: "worker.qdrant",
          operation,
          collection: name,
          pointId: String(point.id),
          outcome: "skipped_missing_payload",
        });
        return [];
      }
      return [{ payload, score: point.score }];
    });

  const toVector = (point: UpsertPoint<TPayload, TSparse>) => {
    const dense = point.vector;
    if (!sparse) {
      return dense;
    }
    const { text } = point as { text: string };
    return { bm25: { model: "qdrant/bm25" as const, text }, dense };
  };

  return {
    name,
    dimensions,

    async ensure(): Promise<boolean> {
      try {
        const collections = await client.getCollections();
        if (collections.collections.some((c) => c.name === name)) {
          return true;
        }

        await client.createCollection(name, {
          optimizers_config: { indexing_threshold: 0 },
          ...(sparse
            ? {
                sparse_vectors: { bm25: { modifier: "idf" as const } },
                vectors: { dense: { distance: "Cosine" as const, size: dimensions } },
              }
            : { vectors: { distance: "Cosine" as const, size: dimensions } }),
        });

        for (const index of descriptor.payloadIndexes) {
          await client.createPayloadIndex(name, {
            field_name: index.field,
            field_schema: index.schema,
          });
        }

        log.info({
          action: "worker.qdrant",
          operation: "collection.create",
          collection: name,
          embeddingDimensions: dimensions,
        });
        return true;
      } catch (error) {
        log.error({
          action: "worker.qdrant",
          operation: "collection.ensure",
          collection: name,
          error: errorFields(error),
        });
        return false;
      }
    },

    pointIdFor(fields) {
      return descriptor.key(fields);
    },

    async get(fields) {
      const id = requirePointId(fields, "get");
      try {
        const points = await client.retrieve(name, {
          ids: [id],
          with_payload: true,
        });
        const point = points[0];
        return point ? (point.payload as unknown as TPayload) : null;
      } catch (error) {
        return fail("get", error);
      }
    },

    async upsert(point) {
      await this.upsertBatch([point]);
    },

    async upsertBatch(points) {
      if (points.length === 0) {
        return;
      }
      try {
        await client.upsert(name, {
          points: points.map((point) => ({
            id: requirePointId(
              point.payload as Pick<TPayload, TKeyFields>,
              "upsert"
            ),
            payload: point.payload as unknown as Record<string, unknown>,
            vector: toVector(point),
          })),
          wait: true,
        });
      } catch (error) {
        if (error instanceof VectorIndexError) {
          throw error;
        }
        return fail("upsert", error);
      }
    },

    async patch(fields, values) {
      const id = requirePointId(fields, "patch");
      try {
        await client.setPayload(name, {
          payload: values as Record<string, unknown>,
          points: [id],
          wait: true,
        });
      } catch (error) {
        return fail("patch", error);
      }
    },

    async remove(fields) {
      const id = requirePointId(fields, "remove");
      try {
        await client.delete(name, { points: [id], wait: true });
      } catch (error) {
        return fail("remove", error);
      }
    },

    async removeWhere(options) {
      try {
        await client.delete(name, {
          filter: buildFilter(options),
          wait: true,
        });
      } catch (error) {
        return fail("removeWhere", error);
      }
    },

    async search(vector, options) {
      const { limit = 10, scoreThreshold } = options;
      try {
        const results = await client.search(name, {
          filter: buildFilter(options),
          limit,
          score_threshold: scoreThreshold,
          vector: sparse ? { name: "dense", vector } : vector,
          with_payload: true,
        });
        return decodeHits(results, "search");
      } catch (error) {
        return fail("search", error);
      }
    },

    async hybrid(query, options) {
      if (!sparse) {
        return fail(
          "hybrid",
          new Error("Collection has no sparse vector; use search()")
        );
      }
      const { limit = 5 } = options;
      try {
        const results = await client.query(name, {
          filter: buildFilter(options),
          limit,
          prefetch: [
            { query: query.vector, using: "dense", limit },
            {
              query: {
                model: "qdrant/bm25",
                text: query.text,
              } as unknown as number[],
              using: "bm25",
              limit,
            },
          ],
          query: { fusion: "rrf" as const },
          with_payload: true,
        });
        return decodeHits(
          results.points.map((point) => ({ ...point, score: point.score ?? 0 })),
          "hybrid"
        );
      } catch (error) {
        return fail("hybrid", error);
      }
    },

    async scroll(options) {
      const { limit = 50 } = options;
      try {
        const results = await client.scroll(name, {
          filter: buildFilter(options),
          limit,
          with_payload: true,
        });
        return results.points.flatMap((point) => {
          const payload = point.payload as unknown as TPayload | null;
          return payload ? [payload] : [];
        });
      } catch (error) {
        return fail("scroll", error);
      }
    },
  };
};
