import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { portalAuthClient } from "../portal-auth-client";

export const getPortalAuthUser = createServerFn({
  method: "GET",
}).handler(async () => {
  const res = await portalAuthClient.getSession({
    fetchOptions: {
      headers: Object.fromEntries(getRequestHeaders()) as HeadersInit,
    },
  });

  return res.data;
});

export type GetSupportAuthUserResponse = Awaited<
  ReturnType<typeof getPortalAuthUser>
>;
