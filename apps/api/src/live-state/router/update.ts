import { publicRoute } from "../factories";
import { schema } from "../schema";

export default publicRoute.collectionRoute(schema.update, {
  read: () => true,
  insert: ({ ctx }) => {
    if (ctx?.internalApiKey) return true;
    if (!ctx?.session) return false;

    return {
      thread: {
        organization: {
          organizationUsers: {
            userId: ctx.session.userId,
            enabled: true,
          },
        },
      },
    };
  },
  update: {
    preMutation: ({ ctx }) => {
      if (ctx?.internalApiKey) return true;
      if (!ctx?.session) return false;

      return {
        thread: {
          organization: {
            organizationUsers: {
              userId: ctx.session.userId,
              enabled: true,
            },
          },
        },
      };
    },
    postMutation: ({ ctx }) => {
      if (ctx?.internalApiKey) return true;
      if (!ctx?.session) return false;

      return {
        thread: {
          organization: {
            organizationUsers: {
              userId: ctx.session.userId,
              enabled: true,
            },
          },
        },
      };
    },
  },
});
