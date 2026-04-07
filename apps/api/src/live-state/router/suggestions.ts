import { privateRoute } from "../factories";
import { schema } from "../schema";

export default privateRoute.collectionRoute(schema.suggestion, {
  read: ({ ctx }) => {
    if (ctx?.internalApiKey) return true;
    if (!ctx?.session) return false;

    return {
      organization: {
        organizationUsers: {
          userId: ctx.session.userId,
          enabled: true,
        },
      },
    };
  },
  insert: ({ ctx }) => {
    if (ctx?.internalApiKey) return true;

    const isDev = process.env.NODE_ENV === "development";
    if (!isDev) return false;
    if (!ctx?.session) return false;

    return {
      organization: {
        organizationUsers: {
          userId: ctx.session.userId,
          enabled: true,
        },
      },
    };
  },
  update: {
    preMutation: ({ ctx }) => {
      if (ctx?.internalApiKey) return true;
      if (!ctx?.session) return false;

      return {
        organization: {
          organizationUsers: {
            userId: ctx.session.userId,
            enabled: true,
          },
        },
      };
    },
    postMutation: ({ ctx }) => {
      if (ctx?.internalApiKey) return true;
      if (!ctx?.session) return false;

      return {
        organization: {
          organizationUsers: {
            userId: ctx.session.userId,
            enabled: true,
          },
        },
      };
    },
  },
});
