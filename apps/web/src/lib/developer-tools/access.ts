export interface DeveloperToolUser {
  email?: string | null;
  emailVerified?: boolean;
}

export interface DeveloperToolOrganizationUser {
  enabled: boolean;
  organizationId: string;
}

/** Keep the client-side visibility check identical to the server predicate. */
export const isInternalDeveloperEmail = (email?: string | null): boolean => {
  if (!email) {
    return false;
  }

  const firstAt = email.indexOf("@");
  const lastAt = email.lastIndexOf("@");
  if (firstAt <= 0 || firstAt !== lastAt) {
    return false;
  }

  const localPart = email.slice(0, firstAt);
  const domain = email.slice(firstAt + 1);
  return !/\s/.test(localPart) && domain.toLowerCase() === "tryfrontdesk.app";
};

/**
 * UI visibility only. The developer-action API remains the authorization
 * boundary; this prevents the production toolbar from advertising controls to
 * users who cannot use them while preserving the broad local workflow.
 */
export const hasDeveloperToolAccess = ({
  isDevelopment,
  organizationId,
  organizationUsers,
  user,
}: {
  isDevelopment: boolean;
  organizationId?: string;
  organizationUsers: DeveloperToolOrganizationUser[];
  user: DeveloperToolUser | null | undefined;
}): boolean => {
  if (!organizationId) {
    return false;
  }

  const isMember = organizationUsers.some(
    (organizationUser) =>
      organizationUser.organizationId === organizationId &&
      organizationUser.enabled
  );
  if (!isMember) {
    return false;
  }

  return (
    isDevelopment ||
    (user?.emailVerified === true && isInternalDeveloperEmail(user.email))
  );
};
