import { tool } from "ai";
import { z } from "zod";

// ─── System Prompt ───────────────────────────────────────────────────────────

export interface AgentChatContext {
  threadMetadata: string;
  threadContext: string;
  suggestionsContext: string;
  customInstructions?: string | null;
}

export function buildSystemPrompt(ctx: AgentChatContext): string {
  return `You are a helpful AI assistant for a customer support team. You have access to the following support thread for context.

## Thread Details
${ctx.threadMetadata}

## Thread Messages
${ctx.threadContext}
${ctx.suggestionsContext}
You have a tool called "searchDocumentation" that lets you search the organization's documentation. Use it when the user asks questions that might be answered by documentation, or when you need to look up product details, guides, or technical information.

You also have a tool called "setDraft" that lets you draft a reply message for the support agent to send to the customer. Use it when the user asks you to draft, write, or compose a reply, or when it makes sense to propose a response to the customer. The draft will be shown to the support agent for review and editing before sending. If a draft already exists, setDraft will replace it.

You also have a tool called "getDraft" that lets you read the current draft reply. Use it when the user asks about or references their current draft, or when you need to see the draft before making modifications. The support agent may have edited the draft manually, so always use getDraft to read the latest version before updating it with setDraft.

You also have tools to explore other support threads in the organization:
- "searchThreads": Search across all support threads using a text query. Use it to find related issues, check if a problem has been reported before, or find context from past conversations.
- "getThread": Read the full details and messages of a specific thread by its ID. Use it after finding a thread via search to get the complete conversation.
- "listThreads": Browse recent support threads, optionally filtered by status or priority. Use it to get an overview of current issues or find threads with a specific status.
${ctx.customInstructions ? `\n## Custom Instructions\n${ctx.customInstructions}\n` : ""}
Use the thread context to help answer questions about this support thread. Be concise and helpful.

IMPORTANT: When mentioning threads in your responses, ALWAYS use markdown link syntax with the thread: protocol: [Thread Name](thread:threadId). Use the "_id" field from tool results as the threadId. This creates clickable thread chips in the UI. If multiple threads share the same name, disambiguate using other details in the link text (e.g. author or date). NEVER include raw thread IDs as plain text — always wrap them in the thread: link syntax.

## Action Rules
Follow these rules to decide which tools to use:

1. **If the user asks to UPDATE or EDIT an existing draft** → call getDraft, then setDraft. Do NOT search.
2. **If the user asks to draft, write, reply, compose, or respond** → search for context using searchDocumentation and/or searchThreads (you may retry once with a different query if the first returns no results), then MUST call setDraft. Do not search more than twice per tool. Always draft based on whatever context you have — even if all searches return empty, use the thread messages to write the draft.
3. **If the user asks to search, look up, find, or list** → use ONLY the requested tool (searchThreads, searchDocumentation, or listThreads). Do NOT call setDraft. Present results and stop.
4. **If the user asks a question about this thread** → answer from context. No tools needed unless the answer requires external information.

IMPORTANT: In rules 1-3, use ONLY the tools listed. Do not add extra tools like listThreads or getThread unless the user specifically asks for them or suggestions mention a related thread to read. NEVER call the same tool more than once — one call per tool is enough.

IMPORTANT: When the user references a specific thread by ID (e.g., "01jnqxk5vg3mardze7tq0bn8yh"), ALWAYS use the getThread tool to fetch its full details and messages. Do not attempt to answer from memory or from partial context in the suggestions section — always fetch the thread first.`;
}

// ─── Metadata Formatters ─────────────────────────────────────────────────────

export const STATUS_LABELS: Record<number, string> = {
  0: "Open",
  1: "In Progress",
  2: "Resolved",
  3: "Closed",
};

export const PRIORITY_LABELS: Record<number, string> = {
  0: "None",
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

export interface ThreadMetadataParams {
  name: string;
  author: string;
  createdAt: string;
  status: string;
  priority: string;
  assignee: string | null;
  labels: string[];
  externalOrigin?: string | null;
}

export function formatThreadMetadata(params: ThreadMetadataParams): string {
  return [
    `Title: "${params.name}"`,
    `Created by: ${params.author}`,
    `Created at: ${params.createdAt}`,
    `Status: ${params.status}`,
    `Priority: ${params.priority}`,
    `Assignee: ${params.assignee ?? "Unassigned"}`,
    params.labels.length > 0 ? `Labels: ${params.labels.join(", ")}` : null,
    params.externalOrigin ? `Source: ${params.externalOrigin}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface SuggestionsContextParams {
  relatedThreads?: string[];
  suggestedDuplicate?: {
    _id: string;
    threadName: string;
    confidence: string | null;
    reason: string | null;
  } | null;
  suggestedStatus?: {
    status: string;
    reasoning: string | null;
  } | null;
  suggestedLabels?: string[];
}

export function formatSuggestionsContext(
  params: SuggestionsContextParams,
): string {
  const lines: string[] = [];

  if (params.relatedThreads && params.relatedThreads.length > 0) {
    lines.push(
      "### Related Threads",
      "These threads were identified as similar to the current thread based on content analysis. You can use the getThread tool with their _id to read their full conversation.",
      ...params.relatedThreads,
    );
  }

  if (params.suggestedDuplicate) {
    lines.push(
      "### Possible Duplicate",
      `This thread may be a duplicate of "${params.suggestedDuplicate.threadName}" (_id: ${params.suggestedDuplicate._id})${params.suggestedDuplicate.confidence ? `, confidence: ${params.suggestedDuplicate.confidence}` : ""}${params.suggestedDuplicate.reason ? `. Reason: ${params.suggestedDuplicate.reason}` : ""}`,
    );
  }

  if (params.suggestedStatus) {
    lines.push(
      "### Suggested Status Change",
      `The system suggests changing status to "${params.suggestedStatus.status}"${params.suggestedStatus.reasoning ? `. Reasoning: ${params.suggestedStatus.reasoning}` : ""}`,
    );
  }

  if (params.suggestedLabels && params.suggestedLabels.length > 0) {
    lines.push(
      "### Suggested Labels",
      `The system suggests adding these labels: ${params.suggestedLabels.join(", ")}`,
    );
  }

  return lines.length > 0
    ? `\n## Suggestions & Intelligence\nThe following suggestions have been automatically generated by our analysis system for this thread.\nIMPORTANT: When suggestions mention a related or duplicate thread, you SHOULD use getThread to read that thread's full conversation before drafting a reply or providing advice. This context is valuable for giving accurate, informed responses.\n${lines.join("\n")}\n`
    : "";
}

// ─── Tool Definitions ────────────────────────────────────────────────────────

export interface SearchDocumentationResult {
  title: string;
  url: string;
  content: string;
  section: string;
}

export interface SearchThreadsResult {
  _id: string;
  name: string;
  status: string;
  priority: string;
  author: string;
  createdAt: string;
  matchingMessageSnippet: string;
  score: number;
}

export interface GetThreadResult {
  _id: string;
  name: string;
  status: string;
  priority: string;
  author: string;
  assignee: string | null;
  labels: string[];
  createdAt: string;
  externalOrigin: string | null;
  messageCount: number;
  note?: string;
  messages: Array<{ author: string; content: string; createdAt: string }>;
}

export interface ListThreadsResult {
  _id: string;
  name: string;
  status: string;
  priority: string;
  author: string;
  assignee: string | null;
  createdAt: string;
  externalOrigin: string | null;
}

export interface AgentChatToolImplementations {
  searchDocumentation: (args: {
    query: string;
  }) => Promise<SearchDocumentationResult[]>;
  getDraft: (args: Record<string, never>) => Promise<{
    hasDraft: boolean;
    content: string | null;
  }>;
  setDraft: (args: { content: string }) => Promise<{ success: boolean }>;
  searchThreads: (args: { query: string }) => Promise<SearchThreadsResult[]>;
  getThread: (args: {
    threadId: string;
  }) => Promise<GetThreadResult | { error: string }>;
  listThreads: (args: {
    status?: string;
    priority?: string;
    limit: number;
  }) => Promise<ListThreadsResult[]>;
}

export function buildAgentChatTools(
  implementations: AgentChatToolImplementations,
) {
  return {
    searchDocumentation: tool({
      description:
        "Search the organization's documentation for relevant information. Use this when you need to look up product details, guides, how-to instructions, or technical information to help answer the user's question.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("The search query to find relevant documentation"),
      }),
      execute: implementations.searchDocumentation,
    }),
    getDraft: tool({
      description:
        "Read the current draft reply. Use this when you need to see the support agent's current draft before making changes.",
      inputSchema: z.object({}),
      execute: implementations.getDraft,
    }),
    setDraft: tool({
      description:
        "Draft a reply message for the support agent to send to the customer. This replaces the current draft if one exists. The draft will be shown to the agent for review and editing before sending. Use markdown formatting. You MUST call this tool when the user asks to draft, write, reply, or respond. Do not stop after searching without calling this tool.",
      inputSchema: z.object({
        content: z
          .string()
          .describe("The markdown content of the draft reply message"),
      }),
      execute: implementations.setDraft,
    }),
    searchThreads: tool({
      description:
        "Search across all support threads in the organization using a text query. Use this to find related issues, check if a problem has been reported before, or find context from past conversations. Results include an _id field. When presenting results to the user, ALWAYS format thread references as [Thread Name](thread:_id) markdown links.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("The search query to find relevant support threads"),
      }),
      execute: implementations.searchThreads,
    }),
    getThread: tool({
      description:
        "Read the full details and messages of a specific support thread by its ID. Use this after finding a thread via search to get the complete conversation.",
      inputSchema: z.object({
        threadId: z.string().describe("The ID of the thread to retrieve"),
      }),
      execute: implementations.getThread,
    }),
    listThreads: tool({
      description:
        "Browse recent support threads in the organization, optionally filtered by status or priority. Use this to get an overview of current issues or find threads with a specific status.",
      inputSchema: z.object({
        status: z
          .enum(["Open", "In Progress", "Resolved", "Closed"])
          .optional()
          .describe("Filter by thread status"),
        priority: z
          .enum(["None", "Low", "Medium", "High", "Urgent"])
          .optional()
          .describe("Filter by thread priority"),
        limit: z
          .number()
          .min(1)
          .max(20)
          .default(10)
          .describe("Number of threads to return (max 20)"),
      }),
      execute: implementations.listThreads,
    }),
  };
}
