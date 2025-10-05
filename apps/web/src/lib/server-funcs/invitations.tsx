import { InferLiveObject } from "@live-state/sync";
import { createServerFn } from "@tanstack/react-start";
import { getHeaders } from "@tanstack/react-start/server";
import { schema } from "api/schema";
import { z } from "zod";
import { authClient } from "../auth-client";
import { fetchClient } from "../live-state";

export const getInvitation = createServerFn({
  method: "GET",
})
  .validator(
    z.object({
      id: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const { data: sessionData } = await authClient.getSession({
      fetchOptions: {
        headers: getHeaders() as HeadersInit,
      },
    });

    if (!sessionData) {
      throw new Error("UNAUTHORIZED");
    }

    const { user } = sessionData;

    const invitation = Object.values(
      await fetchClient.invite.get({
        where: {
          id: data.id,
        },
        include: {
          organization: true,
          creator: true,
        },
      }),
    )[0] as InferLiveObject<
      (typeof schema)["invite"],
      { organization: true; creator: true }
    >;

    if (!invitation) {
      throw new Error("INVITATION_NOT_FOUND");
    }

    if (invitation.email !== user.email) {
      throw new Error("INVALID_USER");
    }

    if (new Date(invitation.expiresAt.toString()) < new Date()) {
      throw new Error("INVITATION_EXPIRED");
    }

    if (!invitation.active) {
      throw new Error("INVITATION_NOT_ACTIVE");
    }

    return invitation;
  });
