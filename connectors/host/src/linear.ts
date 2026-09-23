import type { HostedConnector } from "./host";

export const linearConnector: HostedConnector = {
  async invoke({ capability, method }) {
    if (capability === "issue-tracker" && method === "listTargets") {
      return { body: { targets: [] }, status: 200 };
    }
    return { body: { error: "METHOD_NOT_IMPLEMENTED" }, status: 501 };
  },
  async probe() {
    return { live: false };
  },
  type: "linear",
};
