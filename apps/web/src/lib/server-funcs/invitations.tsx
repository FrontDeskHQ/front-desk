import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchClient } from "../live-state";
import { getAuthUser } from "./get-auth-user";

export const getInvitation = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      id: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const sessionData = await getAuthUser();

    if (!sessionData) {
      throw new Error("UNAUTHORIZED");
    }

    const { user } = sessionData;

    const invitation = await fetchClient.query.invite
      .where({
        id: data.id,
      })
      .include({
        organization: true,
        creator: true,
      })
      .get()
      .then((v) => v[0])
      .catch(() => null);

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
