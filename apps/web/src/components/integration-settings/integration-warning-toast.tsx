import { useLiveQuery } from "@live-state/sync/client";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai/react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { activeOrganizationAtom } from "~/lib/atoms";
import { useIntegrationWarnings } from "~/lib/hooks/query/use-integration-warnings";
import { query } from "~/lib/live-state";

export function IntegrationWarningToast() {
  const { user } = getRouteApi("/app").useRouteContext();
  const activeOrg = useAtomValue(activeOrganizationAtom);
  const navigate = useNavigate();

  const toastId = useRef<string | number | null>(null);

  const organizationUser = useLiveQuery(
    query.organizationUser.first({
      organizationId: activeOrg?.id,
      userId: user.id,
    }),
  );

  const isOwner = organizationUser?.role === "owner";
  const warnings = useIntegrationWarnings();
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (!isOwner) return;

    if (warnings.length > 0 && !dismissedRef.current && !toastId.current) {
      const firstWarning = warnings[0];
      toastId.current = toast(`${firstWarning.label}: ${firstWarning.title}`, {
        description: firstWarning.subtitle,
        duration: Infinity,
        action: {
          label: "Configure",
          onClick: () => {
            navigate({ to: firstWarning.settingsPath });
          },
        },
        onDismiss: () => {
          dismissedRef.current = true;
        },
      });
    } else if (warnings.length === 0 && toastId.current) {
      toast.dismiss(toastId.current);
    }
  }, [warnings, isOwner, navigate]);

  useEffect(() => {
    return () => {
      if (toastId.current) {
        toast.dismiss(toastId.current);
        toastId.current = null;
      }
    };
  }, []);

  return null;
}
