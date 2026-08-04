import { describe, expect, it } from "vitest";

import type { AuthorizeReq, DeveloperActionDeniedEvent } from "./authorize";
import {
  authorizeDeveloperAction,
  isInternalDeveloperEmail,
} from "./authorize";

const organizationId = "org-a";

const workspaceRequest = (
  overrides: Partial<NonNullable<AuthorizeReq["context"]>> = {}
): AuthorizeReq => ({
  context: {
    orgUsers: [{ organizationId, role: "user" }],
    session: { userId: "user-a" },
    user: {
      email: "dev@tryfrontdesk.app",
      emailVerified: true,
      name: "Dev User",
    },
    ...overrides,
  },
});

const expectDenied = (
  req: AuthorizeReq,
  options: Parameters<typeof authorizeDeveloperAction>[2] = {}
): DeveloperActionDeniedEvent => {
  let event: DeveloperActionDeniedEvent | undefined;

  expect(() =>
    authorizeDeveloperAction(req, organizationId, {
      ...options,
      onDenied: (denial) => {
        event = denial;
      },
    })
  ).toThrow("UNAUTHORIZED");

  expect(event).toBeDefined();
  return event as DeveloperActionDeniedEvent;
};

describe("internal developer email checks", () => {
  it("accepts the exact domain case-insensitively", () => {
    expect(isInternalDeveloperEmail("dev@tryfrontdesk.app")).toBeTruthy();
    expect(isInternalDeveloperEmail("DEV@TRYFRONTDESK.APP")).toBeTruthy();
  });

  it("rejects lookalike domains and malformed mailboxes", () => {
    expect(isInternalDeveloperEmail("dev@tryfrontdesk.app.evil")).toBeFalsy();
    expect(isInternalDeveloperEmail("dev@nottryfrontdesk.app")).toBeFalsy();
    expect(isInternalDeveloperEmail("dev@@tryfrontdesk.app")).toBeFalsy();
    expect(isInternalDeveloperEmail("dev@tryfrontdesk.app ")).toBeFalsy();
  });
});

describe("developer-action authorization gate", () => {
  it("allows a verified internal member without an owner role", () => {
    const actor = authorizeDeveloperAction(workspaceRequest(), organizationId, {
      action: "github.pr_replay",
      environment: "production",
    });

    expect(actor).toStrictEqual({ userId: "user-a", userName: "Dev User" });
  });

  it("keeps local development broad for authenticated organization members", () => {
    const actor = authorizeDeveloperAction(
      workspaceRequest({
        user: {
          email: "developer@example.com",
          emailVerified: false,
          name: "Local Developer",
        },
      }),
      organizationId,
      { environment: "development" }
    );

    expect(actor).toStrictEqual({
      userId: "user-a",
      userName: "Local Developer",
    });
  });

  it("denies an unverified internal address in production", () => {
    const event = expectDenied(
      workspaceRequest({
        user: {
          email: "dev@tryfrontdesk.app",
          emailVerified: false,
        },
      }),
      { action: "github.pr_replay", environment: "production" }
    );

    expect(event).toMatchObject({
      action: "github.pr_replay",
      actorUserId: "user-a",
      event: "developer_action.authorization_denied",
      organizationId,
      reason: "unverified_email",
    });
  });

  it("denies a verified external address in production", () => {
    const event = expectDenied(
      workspaceRequest({
        user: {
          email: "dev@example.com",
          emailVerified: true,
        },
      }),
      { environment: "production" }
    );

    expect(event.reason).toBe("non_internal_email");
  });

  it("fails closed when NODE_ENV is unset", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;

    try {
      const event = expectDenied(
        workspaceRequest({
          user: {
            email: "developer@example.com",
            emailVerified: true,
          },
        }),
        { action: "github.pr_replay" }
      );

      expect(event.reason).toBe("non_internal_email");
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  it("denies unauthenticated and non-member requests", () => {
    const unauthenticated = expectDenied(
      { context: { orgUsers: [] } },
      { environment: "production" }
    );
    expect(unauthenticated.reason).toBe("missing_session");

    const nonMember = expectDenied(
      workspaceRequest({
        orgUsers: [{ organizationId: "org-b", role: "owner" }],
      }),
      { environment: "production" }
    );
    expect(nonMember.reason).toBe("not_organization_member");
  });

  it("does not let connector or public credentials satisfy the gate", () => {
    const internalKey = expectDenied(
      workspaceRequest({ internalApiKey: "internal-secret" }),
      { environment: "production" }
    );
    expect(internalKey.reason).toBe("missing_session");

    const publicKey = expectDenied(
      workspaceRequest({
        publicApiKey: { ownerId: organizationId },
      }),
      { environment: "development" }
    );
    expect(publicKey.reason).toBe("missing_session");
  });
});
