import type { ParsedSummary } from "../../../../../types";
import type { DraftReplyInput } from "../draft";

export type DraftExpectations = {
  // Keywords/phrases the draft should surface (case-insensitive substring).
  mustMention?: string[];
  // Keywords/phrases the draft must NOT surface (hallucination / off-policy).
  mustNotMention?: string[];
  // When true, the drafter should decline (draftMarkdown === null).
  mustBeNullCandidate?: boolean;
};

export type DraftGeneratorTestCase = {
  name: string;
  input: DraftReplyInput;
  // Plain-language description of what a good draft does — fed to the
  // LLM-as-judge scorers as the "expected behavior".
  expected: string;
  expectations: DraftExpectations;
};

const sum = (s: ParsedSummary): ParsedSummary => s;
const customer = (content: string) =>
  ({ role: "customer" as const, content });
const agent = (content: string) => ({ role: "agent" as const, content });

// Reused org voices.
const FRIENDLY_VOICE =
  "Be warm, concise, and proactive. " +
  "Never promise specific refund timelines unless the help docs state them.";
const DEESCALATION_VOICE =
  "When a customer is upset, lead with a genuine apology, acknowledge the " +
  "impact, avoid defensiveness, and never blame the customer. Offer a concrete " +
  "next step. Keep a calm, deferential tone.";

export const draftGeneratorDataset: DraftGeneratorTestCase[] = [
  // ── Standard factual answers ───────────────────────────────────────────
  {
    name: "password reset — clear factual answer",
    input: {
      threadName: "Can't log in",
      recentMessages: [
        customer("I forgot my password and can't find how to reset it."),
      ],
      summary: sum({
        title: "Password reset help",
        shortDescription:
          "Customer forgot their password and needs the reset flow.",
        keywords: ["password", "reset", "login"],
        entities: ["login page"],
        expectedAction: "point to the password reset link",
      }),
      appliedLabels: ["account"],
      customInstructions: FRIENDLY_VOICE,
    },
    expected:
      "Explains how to reset the password (use the 'Forgot password' link on the login page) in a warm, concise tone.",
    expectations: { mustMention: ["reset", "password"] },
  },
  {
    name: "billing — refund timeline from summary",
    input: {
      threadName: "Charged twice",
      recentMessages: [
        customer("I was charged twice for my subscription this month."),
        agent("Sorry about that — can you confirm the last 4 digits?"),
        customer("Sure, it's 4242."),
      ],
      summary: sum({
        title: "Duplicate subscription charge",
        shortDescription:
          "Customer was billed twice; refunds take 3-5 business days per policy.",
        keywords: ["billing", "duplicate", "refund"],
        entities: ["subscription", "card ending 4242"],
        expectedAction: "confirm the refund and the 3-5 business day window",
      }),
      appliedLabels: ["billing"],
      customInstructions: FRIENDLY_VOICE,
    },
    expected:
      "Acknowledges the duplicate charge, confirms a refund, and mentions the 3-5 business day window.",
    expectations: { mustMention: ["refund", "3-5"] },
  },
  {
    name: "feature question — answer present in summary",
    input: {
      threadName: "Export to CSV?",
      recentMessages: [customer("Can I export my reports to CSV?")],
      summary: sum({
        title: "CSV export availability",
        shortDescription:
          "CSV export is available from the Reports page via the Export button.",
        keywords: ["export", "csv", "reports"],
        entities: ["Reports page", "Export button"],
        expectedAction: "explain where the Export button is",
      }),
      appliedLabels: [],
      customInstructions: FRIENDLY_VOICE,
    },
    expected:
      "Confirms CSV export exists and points to the Export button on the Reports page.",
    expectations: { mustMention: ["export", "csv"] },
  },
  {
    name: "shipping status — provide tracking guidance",
    input: {
      threadName: "Where is my order?",
      recentMessages: [
        customer("My order #1188 hasn't arrived yet, can you check?"),
      ],
      summary: sum({
        title: "Order delivery status",
        shortDescription:
          "Customer asks about order #1188; tracking is available in the account Orders page.",
        keywords: ["order", "shipping", "tracking"],
        entities: ["order #1188"],
        expectedAction: "point to the tracking info in Orders",
      }),
      appliedLabels: ["shipping"],
      customInstructions: FRIENDLY_VOICE,
    },
    expected:
      "Acknowledges order #1188 and explains how to find the tracking status in the Orders page.",
    expectations: { mustMention: ["order", "tracking"] },
  },

  // ── Outside knowledge → hedge / clarify, no hallucination ──────────────
  {
    name: "unknown integration — must hedge, not invent",
    input: {
      threadName: "Salesforce integration?",
      recentMessages: [
        customer("Do you integrate with Salesforce, and how do I set it up?"),
      ],
      summary: sum({
        title: "Salesforce integration question",
        shortDescription:
          "Customer asks whether a Salesforce integration exists. No info available.",
        keywords: ["salesforce", "integration"],
        entities: ["Salesforce"],
        expectedAction: "clarify / check internally rather than guess",
      }),
      appliedLabels: [],
      customInstructions: FRIENDLY_VOICE,
    },
    expected:
      "Does NOT claim a Salesforce integration exists or invent setup steps. Hedges or offers to check, asking a clarifying question.",
    expectations: {
      mustNotMention: ["click connect", "go to settings > salesforce"],
    },
  },
  {
    name: "unknown pricing — no invented numbers",
    input: {
      threadName: "Enterprise pricing",
      recentMessages: [
        customer("How much is the Enterprise plan per seat per year?"),
      ],
      summary: sum({
        title: "Enterprise pricing request",
        shortDescription:
          "Customer asks for Enterprise per-seat pricing. No pricing data available.",
        keywords: ["pricing", "enterprise", "seat"],
        entities: ["Enterprise plan"],
        expectedAction: "route to sales rather than quote a price",
      }),
      appliedLabels: ["sales"],
      customInstructions: FRIENDLY_VOICE,
    },
    expected:
      "Does NOT quote a specific price. Offers to connect the customer with sales or asks for details.",
    expectations: { mustNotMention: ["$", "per seat per year is"] },
  },
  {
    name: "out-of-scope technical detail — clarify",
    input: {
      threadName: "API rate limits",
      recentMessages: [
        customer("What's the exact requests-per-minute limit on the API?"),
      ],
      summary: sum({
        title: "API rate limit question",
        shortDescription:
          "Customer asks for the exact API rate limit. Not documented here.",
        keywords: ["api", "rate limit"],
        entities: ["API"],
        expectedAction: "avoid guessing a number; point to docs or follow up",
      }),
      appliedLabels: ["api"],
      customInstructions: FRIENDLY_VOICE,
    },
    expected:
      "Avoids inventing a specific rate-limit number; points to documentation or offers to follow up.",
    expectations: { mustNotMention: ["requests per minute is", "rpm limit is"] },
  },

  // ── Last message from the assistant/agent → null candidate ─────────────
  {
    name: "agent replied last — nothing to draft",
    input: {
      threadName: "Login issue",
      recentMessages: [
        customer("I can't log in."),
        agent("Thanks — could you try clearing your cache and let me know?"),
      ],
      summary: sum({
        title: "Login troubleshooting",
        shortDescription: "Agent asked the customer to clear cache; awaiting reply.",
        keywords: ["login", "cache"],
        entities: ["login"],
        expectedAction: "wait for the customer",
      }),
      appliedLabels: [],
      customInstructions: FRIENDLY_VOICE,
    },
    expected:
      "The most recent message is from the support agent, so there is nothing new to draft.",
    expectations: { mustBeNullCandidate: true },
  },
  {
    name: "agent closed out last — null",
    input: {
      threadName: "Thanks!",
      recentMessages: [
        customer("That fixed it, thank you!"),
        agent("Glad to hear it! I'll close this out — reach out anytime."),
      ],
      summary: sum({
        title: "Resolved login issue",
        shortDescription: "Issue resolved; agent acknowledged and closed.",
        keywords: ["resolved"],
        entities: [],
        expectedAction: "none",
      }),
      appliedLabels: [],
      customInstructions: FRIENDLY_VOICE,
    },
    expected:
      "The agent already responded last; no reply should be drafted.",
    expectations: { mustBeNullCandidate: true },
  },
  {
    name: "no messages — null",
    input: {
      threadName: "Empty thread",
      recentMessages: [],
      summary: null,
      appliedLabels: [],
      customInstructions: null,
    },
    expected: "There is no inbound message to reply to.",
    expectations: { mustBeNullCandidate: true },
  },

  // ── Heated / escalated → tone shift driven by customInstructions ───────
  {
    name: "angry customer — de-escalation voice",
    input: {
      threadName: "This is unacceptable",
      recentMessages: [
        customer(
          "This is the THIRD time your app deleted my data. This is absolutely unacceptable and I'm furious.",
        ),
      ],
      summary: sum({
        title: "Repeated data loss complaint",
        shortDescription:
          "Customer reports data loss for the third time and is very upset.",
        keywords: ["data loss", "complaint", "escalation"],
        entities: ["app"],
        expectedAction: "apologize, acknowledge impact, offer concrete next step",
      }),
      appliedLabels: ["escalation"],
      customInstructions: DEESCALATION_VOICE,
    },
    expected:
      "Leads with a sincere apology, acknowledges the repeated impact, does not blame the customer, and offers a concrete next step — calm and deferential per the org voice.",
    expectations: {
      mustMention: ["apolog"],
      mustNotMention: ["you should have", "your fault"],
    },
  },
  {
    name: "frustrated about wait time — de-escalation",
    input: {
      threadName: "Still waiting",
      recentMessages: [
        customer(
          "I've been waiting 5 days for a response. This is ridiculous customer service.",
        ),
      ],
      summary: sum({
        title: "Slow support response complaint",
        shortDescription: "Customer frustrated about a 5-day wait.",
        keywords: ["wait", "delay", "complaint"],
        entities: [],
        expectedAction: "apologize for the delay and re-engage",
      }),
      appliedLabels: ["escalation"],
      customInstructions: DEESCALATION_VOICE,
    },
    expected:
      "Apologizes for the delay, acknowledges the frustration, and moves the issue forward without defensiveness.",
    expectations: {
      mustMention: ["apolog"],
      mustNotMention: ["calm down"],
    },
  },

  // ── Label-gated voice (vip) → more deferential wording ─────────────────
  {
    name: "vip customer — deferential tone",
    input: {
      threadName: "Onboarding question",
      recentMessages: [
        customer("How do I invite my whole team to the workspace?"),
      ],
      summary: sum({
        title: "Team invite question",
        shortDescription:
          "Customer wants to invite their team; done from Settings > Members > Invite.",
        keywords: ["invite", "team", "members"],
        entities: ["Settings", "Members"],
        expectedAction: "explain the invite flow",
      }),
      appliedLabels: ["vip"],
      customInstructions:
        FRIENDLY_VOICE +
        " For VIP-labeled threads, be extra deferential and offer white-glove help (e.g. a call).",
    },
    expected:
      "Explains the team-invite flow (Settings > Members > Invite) AND, because the thread is VIP-labeled, offers white-glove / extra-attentive help.",
    expectations: { mustMention: ["invite", "members"] },
  },
  {
    name: "non-vip baseline — same question, standard tone",
    input: {
      threadName: "Onboarding question",
      recentMessages: [
        customer("How do I invite my whole team to the workspace?"),
      ],
      summary: sum({
        title: "Team invite question",
        shortDescription:
          "Customer wants to invite their team; done from Settings > Members > Invite.",
        keywords: ["invite", "team", "members"],
        entities: ["Settings", "Members"],
        expectedAction: "explain the invite flow",
      }),
      appliedLabels: [],
      customInstructions: FRIENDLY_VOICE,
    },
    expected:
      "Explains the team-invite flow (Settings > Members > Invite) in the standard friendly tone (no special white-glove offer required).",
    expectations: { mustMention: ["invite", "members"] },
  },

  // ── Multi-turn tail (customer follow-up after agent) → draft ───────────
  {
    name: "customer follow-up after agent reply — draft the answer",
    input: {
      threadName: "Webhook not firing",
      recentMessages: [
        customer("My webhook isn't firing on new orders."),
        agent("Can you confirm the endpoint URL is reachable over HTTPS?"),
        customer("Yes, it's https://my.app/hooks and returns 200 in my tests."),
      ],
      summary: sum({
        title: "Webhook not firing on orders",
        shortDescription:
          "Webhook not triggering; endpoint is reachable and returns 200. Check that the 'order.created' event is subscribed.",
        keywords: ["webhook", "order.created", "subscription"],
        entities: ["webhook", "order.created"],
        expectedAction: "ask them to verify the order.created subscription",
      }),
      appliedLabels: ["api"],
      customInstructions: FRIENDLY_VOICE,
    },
    expected:
      "Responds to the customer's latest message, moving the troubleshooting forward (e.g. verify the order.created event is subscribed).",
    expectations: { mustMention: ["webhook"] },
  },
  {
    name: "clarifying question warranted — ambiguous request",
    input: {
      threadName: "It's broken",
      recentMessages: [customer("It's not working. Please fix it.")],
      summary: sum({
        title: "Vague problem report",
        shortDescription: "Customer reports something is broken but gives no detail.",
        keywords: ["broken", "vague"],
        entities: [],
        expectedAction: "ask for specifics",
      }),
      appliedLabels: [],
      customInstructions: FRIENDLY_VOICE,
    },
    expected:
      "Asks a clarifying question to learn what specifically is broken (what they were doing, any error, which screen).",
    expectations: { mustNotMention: ["i've fixed it", "this is now resolved"] },
  },
  {
    name: "cancellation request — actionable next step",
    input: {
      threadName: "Cancel my plan",
      recentMessages: [customer("I'd like to cancel my subscription, please.")],
      summary: sum({
        title: "Subscription cancellation",
        shortDescription:
          "Customer wants to cancel; this is done from Settings > Billing > Cancel plan.",
        keywords: ["cancel", "subscription", "billing"],
        entities: ["Settings", "Billing"],
        expectedAction: "explain the cancel flow",
      }),
      appliedLabels: ["billing"],
      customInstructions: FRIENDLY_VOICE,
    },
    expected:
      "Explains how to cancel (Settings > Billing > Cancel plan) without being pushy, and offers help if needed.",
    expectations: { mustMention: ["cancel"] },
  },
  {
    name: "thanks-only message — gracious short reply",
    input: {
      threadName: "Quick thanks",
      recentMessages: [
        customer("Just wanted to say your team has been super helpful lately!"),
      ],
      summary: sum({
        title: "Positive feedback",
        shortDescription: "Customer thanks the team; no issue.",
        keywords: ["thanks", "feedback"],
        entities: [],
        expectedAction: "acknowledge warmly",
      }),
      appliedLabels: [],
      customInstructions: FRIENDLY_VOICE,
    },
    expected:
      "Warmly acknowledges the kind words; brief and gracious, no fabricated follow-up tasks.",
    expectations: { mustNotMention: ["ticket number", "i've opened a case"] },
  },
  {
    name: "bug report with known fix in summary",
    input: {
      threadName: "App crashes on upload",
      recentMessages: [
        customer("The app crashes every time I upload a PDF over 10MB."),
      ],
      summary: sum({
        title: "Crash on large PDF upload",
        shortDescription:
          "Known issue: uploads over 10MB fail. Workaround is to compress or split the PDF; a fix is in progress.",
        keywords: ["crash", "upload", "pdf", "10mb"],
        entities: ["PDF upload"],
        expectedAction: "share the workaround and that a fix is underway",
      }),
      appliedLabels: ["bug"],
      customInstructions: FRIENDLY_VOICE,
    },
    expected:
      "Acknowledges the crash, shares the documented workaround (compress/split the PDF), and notes a fix is in progress.",
    expectations: { mustMention: ["upload"], mustNotMention: ["already fixed in production"] },
  },
  {
    name: "no summary available — still answer from messages",
    input: {
      threadName: "Change email",
      recentMessages: [
        customer("How do I change the email address on my account?"),
      ],
      summary: null,
      appliedLabels: ["account"],
      customInstructions: FRIENDLY_VOICE,
    },
    expected:
      "Helps the customer change their account email, or asks where they are if unsure — without inventing exact menu names it doesn't know.",
    expectations: { mustMention: ["email"] },
  },
  {
    name: "feature request — set expectations honestly",
    input: {
      threadName: "Dark mode?",
      recentMessages: [customer("Will you ever add a dark mode?")],
      summary: sum({
        title: "Dark mode feature request",
        shortDescription:
          "Customer asks about dark mode. No roadmap commitment available.",
        keywords: ["dark mode", "feature request"],
        entities: [],
        expectedAction: "thank them and avoid over-promising",
      }),
      appliedLabels: ["feature-request"],
      customInstructions: FRIENDLY_VOICE,
    },
    expected:
      "Thanks the customer for the request and passes it along, without promising a ship date or claiming it's already planned.",
    expectations: { mustNotMention: ["coming next month", "it's already on the roadmap for"] },
  },
];
