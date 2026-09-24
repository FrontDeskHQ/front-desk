/**
 * TypeSafe Jev through Respan.
 * https://www.respan.ai/docs/apis/type-safe-gateway/typesafe-systemone
 *
 * Authorization is the Respan key. A TypeSafe key saved in Respan
 * Settings > Providers is used as-is. Otherwise `TYPESAFE_AI_API_KEY` is
 * sent as `respan_params.credential_override["jev-1.13.0"].api_key`.
 * Respan strips the `typesafe/` model prefix and `respan_params` before
 * forwarding. Streaming is not supported.
 */

export const JEV_MODEL = "typesafe/jev-1.13.0";

/** Credential-override key. Respan looks this up without the `typesafe/` prefix. */
export const JEV_PROVIDER_MODEL = "jev-1.13.0";

export const RESPAN_TYPESAFE_SYSTEMONE_URL =
  "https://api.respan.ai/api/typesafe/v1/systemone";

/** Text, an object, an array, or null. */
export type JevEntry = string | Record<string, unknown> | unknown[] | null;

export interface JevNoulQuestion {
  type: "noul";
  instructions?: JevEntry;
  criteria?: { true?: JevEntry; false?: JevEntry } | null;
}

export interface JevChoiceQuestion {
  type: "choice";
  criteria: Record<string, JevEntry>;
  instructions?: JevEntry;
}

export interface JevScoreQuestion {
  type: "score";
  criteria: JevEntry[];
  instructions?: JevEntry;
}

export type JevQuestion =
  | JevNoulQuestion
  | JevChoiceQuestion
  | JevScoreQuestion;

export interface JevNoulAnswer {
  type: "noul";
  /** Probability of yes. 0 is no, 1 is yes. */
  noul: number;
}

export interface JevChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface JevScoreAnswer {
  type: "score";
  score: number;
  legend: Record<string, JevEntry>;
  probabilities: Record<string, number>;
  confidence: number;
}

export type JevAnswer = JevNoulAnswer | JevChoiceAnswer | JevScoreAnswer;

export interface JevEvaluation {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface EvaluateWithJevInput {
  state: JevEntry;
  questions: Record<string, JevQuestion>;
  /** Overrides `TYPESAFE_AI_API_KEY`. Omit both to use a key saved in Respan. */
  typeSafeApiKey?: string;
}

export interface EvaluateWithJevOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export class JevEvaluationError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`Jev evaluation failed (${status}): ${body}`);
    this.name = "JevEvaluationError";
    this.status = status;
    this.body = body;
  }
}

const RETRYABLE_STATUS = new Set([429, 529]);
const MAX_ATTEMPTS = 3;

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const isEvaluation = (value: unknown): value is JevEvaluation => {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  const usage = record.usage;
  return (
    typeof record.model === "string" &&
    record.answers !== null &&
    typeof record.answers === "object" &&
    usage !== null &&
    typeof usage === "object" &&
    typeof (usage as { input_tokens?: unknown }).input_tokens === "number" &&
    typeof (usage as { output_tokens?: unknown }).output_tokens === "number"
  );
};

const requestBody = (
  input: EvaluateWithJevInput,
  typeSafeApiKey: string | undefined
): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    model: JEV_MODEL,
    state: input.state,
    questions: input.questions,
  };
  if (typeSafeApiKey) {
    body.respan_params = {
      credential_override: {
        [JEV_PROVIDER_MODEL]: { api_key: typeSafeApiKey },
      },
    };
  }
  return body;
};

/**
 * Evaluate one state against named Jev questions.
 * Retries HTTP 429 and 529 with exponential backoff.
 */
export const evaluateWithJev = async (
  input: EvaluateWithJevInput,
  options: EvaluateWithJevOptions = {}
): Promise<JevEvaluation> => {
  const respanApiKey = process.env.RESPAN_API_KEY;
  if (!respanApiKey) {
    throw new Error("RESPAN_API_KEY is required for Jev evaluation");
  }

  const typeSafeApiKey =
    input.typeSafeApiKey ?? process.env.TYPESAFE_AI_API_KEY ?? undefined;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? delay;
  const body = JSON.stringify(requestBody(input, typeSafeApiKey || undefined));

  let lastError: JevEvaluationError | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(200 * 2 ** (attempt - 1));
    }

    const response = await fetchImpl(RESPAN_TYPESAFE_SYSTEMONE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${respanApiKey}`,
        "Content-Type": "application/json",
      },
      body,
    });

    if (response.ok) {
      const payload: unknown = await response.json();
      if (!isEvaluation(payload)) {
        throw new JevEvaluationError(
          response.status,
          "TypeSafe response is missing model, answers, or usage"
        );
      }
      return payload;
    }

    const errorBody = await response.text();
    lastError = new JevEvaluationError(response.status, errorBody);
    if (!RETRYABLE_STATUS.has(response.status)) {
      throw lastError;
    }
  }

  throw lastError ?? new JevEvaluationError(529, "Jev evaluation failed");
};
