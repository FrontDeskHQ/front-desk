import { createFileRoute, redirect } from "@tanstack/react-router";
import { getAuthUser } from "~/lib/server-funcs/get-auth-user";

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const user = await getAuthUser();

    if (!user) {
      throw redirect({
        to: "/",
      });
    }

    return user;
  },
});
