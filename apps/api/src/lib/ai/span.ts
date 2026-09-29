/**
 * Span-01 behavior scoring through Respan.
 * https://www.respan.ai/docs/apis/respan-models/score-span-behaviors
 *
 * Authorization is the Respan key. `span.input` holds the prior messages and
 * `span.output` is the turn being judged. Every behavior is scored in one
 * pass. Span-01 is early access: requests return 403 until Respan enables it
 * for the organization.
 */

/** Span-01 Lite. Free, with a daily cap. */
export const SPAN_FREE_MODEL = "span-01-free";

/** Span-01. Billed on input tokens. */
export const SPAN_PRO_MODEL = "span-01-pro";

export type SpanModel = typeof SPAN_FREE_MODEL | typeof SPAN_PRO_MODEL;

export const RESPAN_SCORES_URL = "https://api.respan.ai/api/v1/scores";

export interface SpanMessage {
  role: string;
  content: string;
}

export interface SpanBehavior {
  id: string;
  /** Say whose behavior to judge and what to look for. At least 3 characters. */
  definition: string;
}

export interface SpanBehaviorResult {
  id: string;
  /** Probability the behavior is present. */
  p_present: number;
  /** Probability the behavior is absent. */
  p_absent: number;
  /** Probability the span lacks the evidence to decide. */
  p_not_observable: number;
}

export interface SpanScore {
  model: SpanModel;
  /** Same order as the request's behaviors. */
  results: SpanBehaviorResult[];
  usage?: {
    input_tokens: number;
  };
}

export interface ScoreWithSpanInput {
  span: {
    input: SpanMessage[];
    output: SpanMessage;
  };
  behaviors: SpanBehavior[];
  /** Defaults to `span-01-free`. */
  model?: SpanModel;
  /** Respan log attribution. Stripped before the scorer sees the request. */
  customerIdentifier?: string;
  metadata?: Record<string, unknown>;
}

export interface ScoreWithSpanOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export class SpanScoreError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`Span-01 scoring failed (${status}): ${body}`);
    this.name = "SpanScoreError";
    this.status = status;
    this.body = body;
  }
}

/** Scorer unreachable, rate limited, unavailable, or timed out. */
const RETRYABLE_STATUS = new Set([424, 429, 503, 504]);
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 30_000;

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const isProbability = (value: unknown): value is number =>
  typeof value === "number" && value >= 0 && value <= 1;

const isResult = (value: unknown): value is SpanBehaviorResult => {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    isProbability(record.p_present) &&
    isProbability(record.p_absent) &&
    isProbability(record.p_not_observable)
  );
};

const isScore = (value: unknown): value is SpanScore => {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.model === "string" &&
    Array.isArray(record.results) &&
    record.results.every(isResult)
  );
};

const requestBody = (input: ScoreWithSpanInput): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    model: input.model ?? SPAN_FREE_MODEL,
    span: input.span,
    behaviors: input.behaviors,
  };
  if (input.customerIdentifier || input.metadata) {
    body.respan_params = {
      ...(input.customerIdentifier && {
        customer_identifier: input.customerIdentifier,
      }),
      ...(input.metadata && { metadata: input.metadata }),
    };
  }
  return body;
};

/**
 * Score one span against named behaviors.
 * Retries network errors, timeouts, and 424, 429, 503, and 504 with
 * exponential backoff.
 */
export const scoreWithSpan = async (
  input: ScoreWithSpanInput,
  options: ScoreWithSpanOptions = {}
): Promise<SpanScore> => {
  const respanApiKey = process.env.RESPAN_API_KEY;
  if (!respanApiKey) {
    throw new Error("RESPAN_API_KEY is required for Span-01 scoring");
  }

  const fetchImpl = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? delay;
  const body = JSON.stringify(requestBody(input));

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(200 * 2 ** (attempt - 1));
    }

    let response: Response;
    try {
      response = await fetchImpl(RESPAN_SCORES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${respanApiKey}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // fetch rejects with TypeError on network failure and TimeoutError on
      // the deadline; anything else is a caller bug.
      if (
        error instanceof TypeError ||
        (error instanceof DOMException && error.name === "TimeoutError")
      ) {
        lastError = error;
        continue;
      }
      throw error;
    }

    if (response.ok) {
      const payload: unknown = await response.json();
      if (!isScore(payload)) {
        throw new SpanScoreError(
          response.status,
          "Span-01 response is missing model or results"
        );
      }
      return payload;
    }

    const errorBody = await response.text();
    lastError = new SpanScoreError(response.status, errorBody);
    if (!RETRYABLE_STATUS.has(response.status)) {
      throw lastError;
    }
  }

  throw lastError ?? new SpanScoreError(503, "Span-01 scoring failed");
};

/** Results keyed by behavior id. */
export const spanResultsById = (
  score: SpanScore
): Record<string, SpanBehaviorResult> =>
  Object.fromEntries(score.results.map((result) => [result.id, result]));
