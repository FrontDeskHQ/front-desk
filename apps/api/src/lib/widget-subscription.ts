import type { WidgetIdentity } from "./authorize";
import { isWidgetIdentityActive } from "./widget-identity";

export const guardWidgetSubscription = <T>(
  identity: WidgetIdentity,
  forward: (value: T) => void,
  isActive: (
    identity: Pick<WidgetIdentity, "keyVersion" | "organizationId">
  ) => Promise<boolean> = isWidgetIdentityActive
): ((value: T) => void) => {
  let pending = Promise.resolve();

  return (value) => {
    pending = pending
      .then(async () => {
        if (await isActive(identity)) {
          forward(value);
        }
      })
      .catch((error) => {
        console.warn("[auth] Widget subscription revalidation failed", error);
      });
  };
};
