import type { WidgetIdentity } from "./authorize";
import { isWidgetIdentityActive } from "./widget-identity";

export const guardWidgetSubscription = <T>(
  identity: WidgetIdentity,
  forward: (value: T) => void,
  isActive: (
    identity: Pick<WidgetIdentity, "keyVersion" | "organizationId">
  ) => Promise<boolean> = isWidgetIdentityActive
): ((value: T) => void) => {
  let revalidation: Promise<boolean> | undefined;

  return (value) => {
    const current =
      revalidation ??
      (revalidation = isActive(identity).finally(() => {
        if (revalidation === current) {
          revalidation = undefined;
        }
      }));

    current
      .then((active) => {
        if (active) {
          forward(value);
        }
      })
      .catch((error) => {
        console.warn("[auth] Widget subscription revalidation failed", error);
      });
  };
};
