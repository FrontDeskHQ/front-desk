import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RESPAN_SCORES_URL,
  SPAN_FREE_MODEL,
  SPAN_PRO_MODEL,
  SpanScoreError,
  scoreWithSpan,
  spanResultsById,
} from "./span";

const spanResponse = {
  model: "span-01-free",
  results: [
    {
      id: "escalation",
      p_present: 0.73,
      p_absent: 0.25,
      p_not_observable: 0.02,
    },
  ],
  usage: { input_tokens: 51 },
};

const escalationInput = {
  span: {
    input: [{ role: "user", content: "Please connect me to a person." }],
    output: {
      role: "assistant",
      content: "I will connect you to our support team.",
    },
  },
  behaviors: [
    {
      id: "escalation",
      definition: "The user wants a human, or the assistant says a handoff is needed.",
    },
  ],
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const mockFetch = () =>
  vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async () => jsonResponse(spanResponse)
  );

const requestInit = (fetchMock: ReturnType<typeof mockFetch>) =>
  fetchMock.mock.calls[0]?.[1];

describe("Span-01 scores", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("posts the documented scores body", async () => {
    vi.stubEnv("RESPAN_API_KEY", "respan-test");
    const fetchMock = mockFetch();

    const result = await scoreWithSpan(escalationInput, { fetch: fetchMock });

    expect(spanResultsById(result).escalation?.p_present).toBe(0.73);
    const init = requestInit(fetchMock);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(RESPAN_SCORES_URL);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer respan-test"
    );
    expect(JSON.parse(String(init?.body))).toStrictEqual({
      model: SPAN_FREE_MODEL,
      span: escalationInput.span,
      behaviors: escalationInput.behaviors,
    });
  });

  it("passes the model and Respan attribution params", async () => {
    vi.stubEnv("RESPAN_API_KEY", "respan-test");
    const fetchMock = mockFetch();

    await scoreWithSpan(
      {
        ...escalationInput,
        model: SPAN_PRO_MODEL,
        customerIdentifier: "org_1",
        metadata: { threadId: "t_1" },
      },
      { fetch: fetchMock }
    );

    const body = JSON.parse(String(requestInit(fetchMock)?.body));
    expect(body.model).toBe(SPAN_PRO_MODEL);
    expect(body.respan_params).toStrictEqual({
      customer_identifier: "org_1",
      metadata: { threadId: "t_1" },
    });
  });

  it("retries 429 and 503, then returns the score", async () => {
    vi.stubEnv("RESPAN_API_KEY", "respan-test");
    const statuses = [429, 503, 200];
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => {
      const status = statuses.shift() ?? 200;
      return status === 200
        ? jsonResponse(spanResponse)
        : new Response("busy", { status });
    });

    const result = await scoreWithSpan(escalationInput, {
      fetch: fetchMock,
      sleep: async () => {},
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.usage).toStrictEqual({ input_tokens: 51 });
  });

  it("throws without retrying a 403", async () => {
    vi.stubEnv("RESPAN_API_KEY", "respan-test");
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => new Response("span-01 not enabled", { status: 403 }));

    await expect(
      scoreWithSpan(escalationInput, {
        fetch: fetchMock,
        sleep: async () => {},
      })
    ).rejects.toBeInstanceOf(SpanScoreError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("requires a Respan API key", async () => {
    vi.stubEnv("RESPAN_API_KEY", "");
    const fetchMock = mockFetch();

    await expect(
      scoreWithSpan(escalationInput, { fetch: fetchMock })
    ).rejects.toThrow("RESPAN_API_KEY is required for Span-01 scoring");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
