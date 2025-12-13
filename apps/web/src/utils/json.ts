export function safeParseJSON(json: string | null | undefined) {
  try {
    return JSON.parse(json ?? "{}");
  } catch {
    return {};
  }
}
