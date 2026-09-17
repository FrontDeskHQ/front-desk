import type { WidgetIdentity } from "./authorize";
import { isWidgetIdentityActive } from "./widget-identity";

const MAX_PENDING_UPDATES = 100;

export const guardWidgetSubscription = <T>(
  identity: WidgetIdentity,
  forward: (value: T) => void,
  isActive: (
    identity: Pick<WidgetIdentity, "keyVersion" | "organizationId">
  ) => Promise<boolean> = isWidgetIdentityActive
): ((value: T) => void) => {
  const pending: T[] = [];
  let draining = false;
  let inactive = false;
  let warnedAboutOverflow = false;

  const drain = async (): Promise<void> => {
    if (draining || inactive) {
      return;
    }

    draining = true;
    try {
      while (pending.length > 0 && !inactive) {
        const batch = pending.splice(0, MAX_PENDING_UPDATES);
        let active: boolean;
        try {
          active = await isActive(identity);
        } catch (error) {
          console.warn("[auth] Widget subscription revalidation failed", error);
          continue;
        }

        if (!active) {
          inactive = true;
          pending.length = 0;
          return;
        }

        for (const value of batch) {
          forward(value);
        }
      }
    } finally {
      draining = false;
      if (pending.length > 0 && !inactive) {
        void drain();
      }
    }
  };

  return (value) => {
    if (inactive) {
      return;
    }
    if (pending.length >= MAX_PENDING_UPDATES) {
      if (!warnedAboutOverflow) {
        warnedAboutOverflow = true;
        console.warn("[auth] Widget subscription update buffer is full");
      }
      return;
    }

    pending.push(value);
    void drain();
  };
};
