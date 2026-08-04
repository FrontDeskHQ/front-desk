import { describe, expect, it } from "vitest";

import { hasDeveloperToolAccess, isInternalDeveloperEmail } from "./access";

const organizationUsers = [{ enabled: true, organizationId: "org-a" }];

describe("developer tool visibility", () => {
  it("matches the production internal mailbox predicate", () => {
    expect(isInternalDeveloperEmail("dev@tryfrontdesk.app")).toBeTruthy();
    expect(isInternalDeveloperEmail("DEV@TRYFRONTDESK.APP")).toBeTruthy();
    expect(isInternalDeveloperEmail("dev@tryfrontdesk.app.evil")).toBeFalsy();
    expect(isInternalDeveloperEmail("dev@@tryfrontdesk.app")).toBeFalsy();
    expect(isInternalDeveloperEmail("dev @tryfrontdesk.app")).toBeFalsy();
  });

  it.each([
    [
      "local authenticated member",
      { isDevelopment: true, user: { email: "local@example.com" } },
      true,
    ],
    [
      "verified internal production member",
      {
        isDevelopment: false,
        user: { email: "dev@tryfrontdesk.app", emailVerified: true },
      },
      true,
    ],
    [
      "unverified internal production member",
      {
        isDevelopment: false,
        user: { email: "dev@tryfrontdesk.app", emailVerified: false },
      },
      false,
    ],
    [
      "external production member",
      {
        isDevelopment: false,
        user: { email: "dev@example.com", emailVerified: true },
      },
      false,
    ],
    [
      "non-member internal user",
      {
        isDevelopment: false,
        organizationUsers: [{ enabled: true, organizationId: "org-b" }],
        user: { email: "dev@tryfrontdesk.app", emailVerified: true },
      },
      false,
    ],
    [
      "disabled production member",
      {
        isDevelopment: false,
        organizationUsers: [{ enabled: false, organizationId: "org-a" }],
        user: { email: "dev@tryfrontdesk.app", emailVerified: true },
      },
      false,
    ],
    ["unauthenticated request", { isDevelopment: false, user: null }, false],
  ] satisfies readonly [
    string,
    {
      isDevelopment: boolean;
      organizationUsers?: { enabled: boolean; organizationId: string }[];
      user: { email: string; emailVerified?: boolean } | null;
    },
    boolean,
  ][])("returns expected visibility for %s", (_name, input, expected) => {
    const memberOrganizations =
      "organizationUsers" in input
        ? input.organizationUsers
        : organizationUsers;
    expect(
      hasDeveloperToolAccess({
        organizationId: "org-a",
        organizationUsers: memberOrganizations,
        isDevelopment: input.isDevelopment,
        user: input.user,
      })
    ).toBe(expected);
  });
});
