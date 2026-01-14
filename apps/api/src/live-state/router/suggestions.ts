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
  insert: () => false,
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
