/**
 * Slack's own fallback for the name shown next to a message: display name,
 * then real name, then username. Empty strings are unset, not names.
 */
export const slackAuthorName = (user: {
  name?: string;
  real_name?: string;
  profile?: {
    display_name?: string;
    real_name?: string;
  };
}): string => {
  const displayName = user.profile?.display_name?.trim();
  const realName = user.real_name?.trim() || user.profile?.real_name?.trim();
  const username = user.name?.trim();
  return displayName || realName || username || "Unknown";
};
