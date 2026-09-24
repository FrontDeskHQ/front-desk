import { afterEach, describe, expect, it, vi } from "vitest";

import {
  JEV_MODEL,
  JEV_PROVIDER_MODEL,
  JevEvaluationError,
  RESPAN_TYPESAFE_SYSTEMONE_URL,
  evaluateWithJev,
} from "./jev";

const jevResponse = {
  model: "jev-1.13.0",
  answers: {
    is_refund: { type: "noul", noul: 0.99 },
  },
  usage: { input_tokens: 279, output_tokens: 22 },
};

const refundQuestion = {
  state: "I want a refund.",
  questions: {
    is_refund: {
      type: "noul" as const,
      instructions: "Is the customer asking for a refund?",
    },
  },
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const requestInit = (
  fetchMock: ReturnType<
    typeof vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >
  >
) => fetchMock.mock.calls[0]?.[1];

describe("Jev systemone", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("posts the documented systemone body", async () => {
    vi.stubEnv("RESPAN_API_KEY", "respan-test");
    vi.stubEnv("TYPESAFE_AI_API_KEY", "typesafe-test");
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => jsonResponse(jevResponse));

    const result = await evaluateWithJev(refundQuestion, { fetch: fetchMock });

    expect(result.answers.is_refund).toStrictEqual({
      type: "noul",
      noul: 0.99,
    });
    const init = requestInit(fetchMock);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(RESPAN_TYPESAFE_SYSTEMONE_URL);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer respan-test"
    );
    expect(JSON.parse(String(init?.body))).toStrictEqual({
      model: JEV_MODEL,
      state: "I want a refund.",
      questions: refundQuestion.questions,
      respan_params: {
        credential_override: {
          [JEV_PROVIDER_MODEL]: { api_key: "typesafe-test" },
        },
      },
    });
  });

  it("omits the credential override when a TypeSafe key is saved in Respan", async () => {
    vi.stubEnv("RESPAN_API_KEY", "respan-test");
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => jsonResponse(jevResponse));

    await evaluateWithJev(refundQuestion, { fetch: fetchMock });

    const body = JSON.parse(String(requestInit(fetchMock)?.body));
    expect(body.respan_params).toBeUndefined();
  });

  it("retries 429 and 529, then returns the evaluation", async () => {
    vi.stubEnv("RESPAN_API_KEY", "respan-test");
    const statuses = [429, 529, 200];
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => {
      const status = statuses.shift() ?? 200;
      return status === 200
        ? jsonResponse(jevResponse)
        : new Response("busy", { status });
    });

    const result = await evaluateWithJev(refundQuestion, {
      fetch: fetchMock,
      sleep: async () => {},
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.usage).toStrictEqual({
      input_tokens: 279,
      output_tokens: 22,
    });
  });

  it("throws the gateway error without retrying a 401", async () => {
    vi.stubEnv("RESPAN_API_KEY", "respan-test");
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => new Response("no typesafe credentials", { status: 401 }));

    await expect(
      evaluateWithJev(refundQuestion, {
        fetch: fetchMock,
        sleep: async () => {},
      })
    ).rejects.toBeInstanceOf(JevEvaluationError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("requires a Respan API key", async () => {
    vi.stubEnv("RESPAN_API_KEY", "");
    const fetchMock =
      vi.fn<
        (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      >();

    await expect(
      evaluateWithJev(refundQuestion, { fetch: fetchMock })
    ).rejects.toThrow("RESPAN_API_KEY is required for Jev evaluation");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
