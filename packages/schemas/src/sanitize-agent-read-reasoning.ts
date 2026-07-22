/**
 * Strips internal agent artifacts from thread-read reasoning before it is shown to users.
 */

const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

const ULID_RE = /\b[0-7][0-9A-HJKMNP-TV-Z]{25}\b/g;

const THREAD_MARKDOWN_LINK_RE = /\[([^\]]+)\]\(thread:[^)]+\)/g;

const MESSAGE_ID_ATTR_RE = /\bmessageId\s*=\s*[^\s\])]+/gi;

const CONFIDENCE_PHRASE_RE =
  /\b(?:confidence|similarity|match score|hint score|urgency score)\s*[:=]?\s*(?:\d{1,3}(?:\.\d+)?%?|0?\.\d+)\b/gi;

const PAREN_SCORE_RE =
  /\(\s*(?:confidence|similarity|score|match)\s*[:=]?\s*[\d.]+%?\s*\)/gi;

const PERCENT_MATCH_RE =
  /\b\d{1,3}(?:\.\d+)?%\s*(?:confidence|match|similarity)\b|\b(?:confidence|match|similarity)\s*(?:of\s*)?\d{1,3}(?:\.\d+)?%/gi;

const INTERNAL_PHRASE_RE =
  /\b(?:hint\s+bag|hintbag|evidence\s+bag|tool\s+calls?|tool\s+investigation|read_thread|search_documentation|read_documentation_page|preprocessor\s+digest|thread\s+digest|synthesis\s+agent|sourceInputMessageId)\b/gi;

const SENTENCE_WITH_INTERNAL_RE =
  /[^.!?\n]*\b(?:hint\s+bag|hintbag|tool\s+calls?|read_thread|search_documentation|read_documentation_page)\b[^.!?\n]*[.!?]?/gi;

const collapseWhitespace = (text: string): string =>
  text
    .replaceAll(/\s{2,}/g, " ")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();

export const sanitizeAgentReadReasoning = (reasoning: string): string => {
  let text = reasoning.trim();
  if (!text) {
    return "";
  }

  text = text
    .replace(THREAD_MARKDOWN_LINK_RE, "$1")
    .replace(MESSAGE_ID_ATTR_RE, "")
    .replace(UUID_RE, "")
    .replace(ULID_RE, "")
    .replace(CONFIDENCE_PHRASE_RE, "")
    .replace(PAREN_SCORE_RE, "")
    .replace(PERCENT_MATCH_RE, "")
    .replace(INTERNAL_PHRASE_RE, "")
    .replace(SENTENCE_WITH_INTERNAL_RE, "");

  return collapseWhitespace(text);
};
