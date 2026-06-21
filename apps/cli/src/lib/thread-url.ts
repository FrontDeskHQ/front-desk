const slugifyThreadName = (name: string): string => {
  const words = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/[\s-]+/)
    .filter(Boolean);

  let out = "";
  for (let i = 0; i < Math.min(words.length, 8); i++) {
    const word = words[i];
    if (!word) continue;
    const next = out ? `${out}-${word}` : word;
    if (next.length > 64) break;
    out = next;
  }
  return out;
};

export const buildThreadUrl = ({
  webUrl,
  orgSlug,
  threadId,
  shortId,
  title,
}: {
  webUrl: string;
  orgSlug: string;
  threadId: string;
  shortId: number | null;
  title: string;
}): string => {
  const base = webUrl.replace(/\/$/, "");
  const param =
    shortId == null
      ? threadId
      : (() => {
          const slug = slugifyThreadName(title);
          return slug ? `${shortId}-${slug}` : String(shortId);
        })();

  return `${base}/support/${encodeURIComponent(orgSlug)}/threads/${encodeURIComponent(param)}`;
};
