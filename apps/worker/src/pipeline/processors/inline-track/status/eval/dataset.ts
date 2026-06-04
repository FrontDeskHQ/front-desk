import type { ParsedSummary } from "../../../../../types";
import type { AllowedStatus, InferStatusInput } from "../infer";

export type ExpectedConfidenceBucket = "high" | "low" | "none";

export type StatusInfererTestCase = {
  name: string;
  input: InferStatusInput;
  expectedStatus: number | null;
  expectedConfidenceBucket: ExpectedConfidenceBucket;
};

// Mirrors STATUS_LABELS minus statuses the inferer is not allowed to suggest
// (see NON_SUGGESTABLE_STATUSES in processor.ts — currently excludes Duplicated).
const STATUSES: AllowedStatus[] = [
  { code: 0, label: "Open" },
  { code: 1, label: "In progress" },
  { code: 2, label: "Resolved" },
  { code: 3, label: "Closed" },
];

const sum = (s: ParsedSummary): ParsedSummary => s;

const customer = (content: string) =>
  ({ role: "customer" as const, content });
const agent = (content: string) => ({ role: "agent" as const, content });

export const statusInfererDataset: StatusInfererTestCase[] = [
  // --- Clear: customer confirms fix → Resolved ----------------------------
  {
    name: "customer confirms fix → resolved",
    input: {
      threadName: "Login button does nothing",
      latestMessageContent: "Thanks, that worked! All good now.",
      recentMessages: [
        customer("The login button does nothing when I click it."),
        agent("Could you try clearing your cache and reloading?"),
        customer("Thanks, that worked! All good now."),
      ],
      summary: sum({
        title: "Login button unresponsive in web app",
        shortDescription:
          "Customer clicks the login button and nothing happens — no navigation, no error.",
        keywords: ["login", "button", "unresponsive", "cache"],
        entities: ["login form", "web app"],
        expectedAction: "troubleshooting / cache guidance",
      }),
      currentStatus: 1,
      allowedStatuses: STATUSES,
    },
    expectedStatus: 2,
    expectedConfidenceBucket: "high",
  },
  {
    name: "customer says issue resolved itself",
    input: {
      threadName: "Slow dashboard",
      latestMessageContent:
        "Never mind — it's fast again after the maintenance window. You can close this.",
      recentMessages: [
        customer("Dashboard is taking 30s to load."),
        customer(
          "Never mind — it's fast again after the maintenance window. You can close this.",
        ),
      ],
      summary: sum({
        title: "Dashboard load time degraded",
        shortDescription:
          "Dashboard takes ~30s to load; customer reports it self-resolved after a maintenance window.",
        keywords: ["dashboard", "slow", "latency", "maintenance"],
        entities: ["dashboard", "web app"],
        expectedAction: "performance investigation",
      }),
      currentStatus: 0,
      allowedStatuses: STATUSES,
    },
    expectedStatus: 2,
    expectedConfidenceBucket: "high",
  },
  // --- Clear: new question on a resolved thread → Open --------------------
  {
    name: "customer asks new question on resolved thread → open",
    input: {
      threadName: "Export to CSV failing",
      latestMessageContent:
        "Hey, the export works now but I'm seeing a different error when I try PDF export. Can you check?",
      recentMessages: [
        customer("Export to CSV throws an error."),
        agent("Try the new build."),
        customer("Thanks, that fixed it!"),
        customer(
          "Hey, the export works now but I'm seeing a different error when I try PDF export. Can you check?",
        ),
      ],
      summary: sum({
        title: "CSV export throws error",
        shortDescription:
          "Customer cannot export reports to CSV; throws an error on click. Initially resolved, then a separate PDF export issue surfaced.",
        keywords: ["export", "csv", "pdf", "error"],
        entities: ["export feature", "reports"],
        expectedAction: "bug fix",
      }),
      currentStatus: 2,
      allowedStatuses: STATUSES,
    },
    expectedStatus: 0,
    expectedConfidenceBucket: "high",
  },
  {
    name: "customer reopens after close",
    input: {
      threadName: "Webhook signature verification",
      latestMessageContent:
        "It's happening again on production — same signature mismatch.",
      recentMessages: [
        customer("Signature verification failing."),
        agent("Fixed in v2.3."),
        customer("It's happening again on production — same signature mismatch."),
      ],
      summary: sum({
        title: "Webhook signature verification failing",
        shortDescription:
          "Inbound webhooks fail signature verification. Believed fixed in v2.3 but recurred in production.",
        keywords: ["webhook", "signature", "verification", "regression"],
        entities: ["webhooks", "signature verification"],
        expectedAction: "bug fix",
      }),
      currentStatus: 3,
      allowedStatuses: STATUSES,
    },
    expectedStatus: 0,
    expectedConfidenceBucket: "high",
  },
  // --- Agent activity → In progress ---------------------------------------
  {
    name: "agent posts clarifying question → in progress",
    input: {
      threadName: "App crashes on iOS 18",
      latestMessageContent:
        "Could you share the exact device model and the OS build number?",
      recentMessages: [
        customer("App crashes on launch after iOS 18 update."),
        agent("Could you share the exact device model and the OS build number?"),
      ],
      summary: sum({
        title: "App crashes on launch after iOS 18 update",
        shortDescription:
          "Customer reports the mobile app crashes immediately on launch after upgrading to iOS 18.",
        keywords: ["crash", "ios 18", "launch", "mobile"],
        entities: ["iOS app", "iOS 18"],
        expectedAction: "bug investigation",
      }),
      currentStatus: 0,
      allowedStatuses: STATUSES,
    },
    expectedStatus: 1,
    expectedConfidenceBucket: "high",
  },
  {
    name: "agent acknowledges and starts investigating",
    input: {
      threadName: "Billing discrepancy",
      latestMessageContent:
        "Thanks for flagging — I'm pulling up your account now, will get back within the hour.",
      recentMessages: [
        customer("My last invoice charged me twice."),
        agent(
          "Thanks for flagging — I'm pulling up your account now, will get back within the hour.",
        ),
      ],
      summary: sum({
        title: "Double charge on latest invoice",
        shortDescription:
          "Customer's latest invoice shows two charges for the same billing period.",
        keywords: ["billing", "invoice", "double charge", "refund"],
        entities: ["invoice", "billing system"],
        expectedAction: "billing investigation",
      }),
      currentStatus: 0,
      allowedStatuses: STATUSES,
    },
    expectedStatus: 1,
    expectedConfidenceBucket: "high",
  },
  // --- Off-topic / ambiguous → null ---------------------------------------
  {
    name: "off-topic chit-chat → null",
    input: {
      threadName: "Hello",
      latestMessageContent: "Happy holidays everyone!",
      recentMessages: [
        customer("Hi team!"),
        customer("Happy holidays everyone!"),
      ],
      summary: sum({
        title: "Holiday greeting from customer",
        shortDescription: "Customer sent a holiday greeting; no support request.",
        keywords: ["greeting", "holiday"],
        entities: [],
        expectedAction: "none",
      }),
      currentStatus: 0,
      allowedStatuses: STATUSES,
    },
    expectedStatus: null,
    expectedConfidenceBucket: "none",
  },
  {
    name: "ambiguous one-word reply → null",
    input: {
      threadName: "API rate limit",
      latestMessageContent: "Ok.",
      recentMessages: [
        customer("Hitting 429s on bulk imports."),
        agent("We've bumped your limit to 1000 RPM."),
        customer("Ok."),
      ],
      summary: sum({
        title: "429s on bulk import API",
        shortDescription:
          "Customer hitting rate limit (429) on bulk import endpoint. Limit was raised by an agent.",
        keywords: ["rate limit", "429", "bulk import", "api"],
        entities: ["API rate limiter", "bulk import endpoint"],
        expectedAction: "rate limit adjustment",
      }),
      currentStatus: 1,
      allowedStatuses: STATUSES,
    },
    expectedStatus: null,
    expectedConfidenceBucket: "low",
  },
  {
    name: "off-topic solicitation → closed (dismissed, not an issue)",
    input: {
      threadName: "Partnership",
      latestMessageContent:
        "Hi — I run a marketing agency and would love to discuss collaboration!",
      recentMessages: [
        customer(
          "Hi — I run a marketing agency and would love to discuss collaboration!",
        ),
      ],
      summary: sum({
        title: "Unsolicited partnership pitch",
        shortDescription:
          "Sender pitches a marketing-agency partnership; not a support request.",
        keywords: ["partnership", "marketing", "sales pitch"],
        entities: [],
        expectedAction: "dismiss",
      }),
      currentStatus: 0,
      allowedStatuses: STATUSES,
    },
    expectedStatus: 3,
    expectedConfidenceBucket: "high",
  },
  // --- Already matches inferred status → null (skip path) -----------------
  {
    name: "already resolved, customer says thanks again",
    input: {
      threadName: "OAuth callback",
      latestMessageContent: "Confirming again — all working, thanks!",
      recentMessages: [
        customer("OAuth callback returns 500."),
        agent("Fixed."),
        customer("Confirmed working — thank you!"),
        customer("Confirming again — all working, thanks!"),
      ],
      summary: sum({
        title: "OAuth callback returns 500",
        shortDescription:
          "OAuth callback endpoint returned 500 errors during sign-in flow. Fix shipped and confirmed.",
        keywords: ["oauth", "callback", "500", "auth"],
        entities: ["OAuth flow", "callback endpoint"],
        expectedAction: "bug fix",
      }),
      currentStatus: 2,
      allowedStatuses: STATUSES,
    },
    expectedStatus: null,
    expectedConfidenceBucket: "low",
  },
  {
    name: "already in progress, agent posts update",
    input: {
      threadName: "Data pipeline lag",
      latestMessageContent:
        "Still digging — looks like a downstream consumer is back-pressuring.",
      recentMessages: [
        customer("Pipeline running 2h behind."),
        agent("Looking into it."),
        agent(
          "Still digging — looks like a downstream consumer is back-pressuring.",
        ),
      ],
      summary: sum({
        title: "Data pipeline running ~2h behind",
        shortDescription:
          "Customer reports their data pipeline is ~2h behind. Under active investigation; suspected back-pressure from a downstream consumer.",
        keywords: ["pipeline", "lag", "back-pressure", "throughput"],
        entities: ["data pipeline", "downstream consumer"],
        expectedAction: "ops investigation",
      }),
      currentStatus: 1,
      allowedStatuses: STATUSES,
    },
    expectedStatus: null,
    expectedConfidenceBucket: "low",
  },
  // --- Borderline / threshold calibration ---------------------------------
  {
    name: "customer reply with new info on open ticket",
    input: {
      threadName: "Email delivery",
      latestMessageContent:
        "Here are the failing recipient addresses you asked for.",
      recentMessages: [
        customer("Some transactional emails aren't arriving."),
        agent("Can you send us a list of recipients that didn't get them?"),
        customer("Here are the failing recipient addresses you asked for."),
      ],
      summary: sum({
        title: "Transactional emails not arriving for some recipients",
        shortDescription:
          "Subset of transactional emails not reaching recipients. Customer providing failing addresses for investigation.",
        keywords: ["email", "delivery", "transactional", "recipients"],
        entities: ["email provider", "transactional pipeline"],
        expectedAction: "delivery investigation",
      }),
      currentStatus: 1,
      allowedStatuses: STATUSES,
    },
    expectedStatus: null,
    expectedConfidenceBucket: "low",
  },
  {
    name: "subtle resolution: customer says 'works for now'",
    input: {
      threadName: "Search returns stale results",
      latestMessageContent:
        "It seems to be working for now after a hard refresh, will report back if it returns.",
      recentMessages: [
        customer("Search shows results from yesterday."),
        agent("Try a hard refresh."),
        customer(
          "It seems to be working for now after a hard refresh, will report back if it returns.",
        ),
      ],
      summary: sum({
        title: "Search returning stale (cached) results",
        shortDescription:
          "Search results appear cached from the previous day; hard refresh resolved temporarily.",
        keywords: ["search", "stale", "cache", "refresh"],
        entities: ["search index", "browser cache"],
        expectedAction: "cache / indexing investigation",
      }),
      currentStatus: 1,
      allowedStatuses: STATUSES,
    },
    expectedStatus: 2,
    expectedConfidenceBucket: "low",
  },
  {
    name: "soft duplicate-of mention from agent → null (duplicate not suggestable)",
    input: {
      threadName: "iOS push notifications",
      latestMessageContent:
        "This looks like the same issue as the earlier APNs outage thread.",
      recentMessages: [
        customer("Push notifications missing on iOS."),
        agent(
          "This looks like the same issue as the earlier APNs outage thread.",
        ),
      ],
      summary: sum({
        title: "iOS push notifications not delivering",
        shortDescription:
          "Customer's iOS push notifications stopped arriving. Agent suspects it overlaps with an earlier APNs outage.",
        keywords: ["push", "notifications", "ios", "apns", "outage"],
        entities: ["APNs", "iOS app", "push notifications"],
        expectedAction: "outage correlation",
      }),
      currentStatus: 0,
      allowedStatuses: STATUSES,
    },
    expectedStatus: null,
    expectedConfidenceBucket: "low",
  },
  // --- Closed: explicit teardown ------------------------------------------
  {
    name: "customer got the help they needed → resolved (not closed)",
    input: {
      threadName: "Onboarding questions",
      latestMessageContent:
        "Got everything I need — you can close this thread.",
      recentMessages: [
        customer("A few questions about pricing tiers..."),
        agent("Here's a breakdown..."),
        customer("Got everything I need — you can close this thread."),
      ],
      summary: sum({
        title: "Pricing tier questions during onboarding",
        shortDescription:
          "Prospective customer asking how pricing tiers compare during onboarding.",
        keywords: ["pricing", "tiers", "onboarding", "plans"],
        entities: ["pricing page", "plan tiers"],
        expectedAction: "documentation / answer",
      }),
      currentStatus: 1,
      allowedStatuses: STATUSES,
    },
    expectedStatus: 2,
    expectedConfidenceBucket: "high",
  },
  // --- More no-change cases -----------------------------------------------
  {
    name: "agent internal note (no customer-facing change)",
    input: {
      threadName: "Refund request",
      latestMessageContent: "Will loop in finance.",
      recentMessages: [
        customer("Can I get a refund for last month?"),
        agent("Will loop in finance."),
      ],
      summary: sum({
        title: "Customer requesting refund for prior month",
        shortDescription:
          "Customer asking for a refund covering the previous billing cycle; needs finance team involvement.",
        keywords: ["refund", "billing", "finance"],
        entities: ["finance team", "billing"],
        expectedAction: "refund processing",
      }),
      currentStatus: 1,
      allowedStatuses: STATUSES,
    },
    expectedStatus: null,
    expectedConfidenceBucket: "low",
  },
  {
    name: "customer auto-reply / OOO",
    input: {
      threadName: "Sync failure",
      latestMessageContent:
        "I'm out of office until Monday with limited email access.",
      recentMessages: [
        customer("Sync between Slack and FrontDesk failing."),
        agent("Could you re-auth the integration?"),
        customer(
          "I'm out of office until Monday with limited email access.",
        ),
      ],
      summary: sum({
        title: "Slack ↔ FrontDesk sync failing",
        shortDescription:
          "Sync between Slack and FrontDesk no longer working; agent asked customer to re-auth.",
        keywords: ["sync", "slack", "integration", "auth"],
        entities: ["Slack integration", "sync pipeline"],
        expectedAction: "re-authentication",
      }),
      currentStatus: 1,
      allowedStatuses: STATUSES,
    },
    expectedStatus: null,
    expectedConfidenceBucket: "low",
  },
  {
    name: "agent explicitly closes a duplicate → closed (duplicate not suggestable)",
    input: {
      threadName: "Login loop",
      latestMessageContent:
        "Closing this as duplicate of #1247 which already tracks the same fix.",
      recentMessages: [
        customer("Login keeps redirecting to itself."),
        agent(
          "Closing this as duplicate of #1247 which already tracks the same fix.",
        ),
      ],
      summary: sum({
        title: "Login page redirects in a loop",
        shortDescription:
          "Customer's login page redirects to itself indefinitely. Agent identified it as a duplicate of an existing tracked issue.",
        keywords: ["login", "redirect", "loop", "duplicate"],
        entities: ["login flow", "auth redirect"],
        expectedAction: "dismiss as duplicate",
      }),
      currentStatus: 0,
      allowedStatuses: STATUSES,
    },
    expectedStatus: 3,
    expectedConfidenceBucket: "high",
  },
  {
    name: "customer escalates urgency",
    input: {
      threadName: "Production outage",
      latestMessageContent:
        "This is now affecting all of our users — urgent!",
      recentMessages: [
        customer("Some users can't access reports."),
        customer("This is now affecting all of our users — urgent!"),
      ],
      summary: sum({
        title: "Users unable to access reports",
        shortDescription:
          "Initially a subset, now reportedly all of the customer's users cannot access reports. Customer escalating urgency.",
        keywords: ["outage", "reports", "access", "urgent"],
        entities: ["reports feature", "auth / access"],
        expectedAction: "incident response",
      }),
      currentStatus: 0,
      allowedStatuses: STATUSES,
    },
    expectedStatus: null,
    expectedConfidenceBucket: "low",
  },
  {
    name: "customer thanks but new question follows",
    input: {
      threadName: "API key rotation",
      latestMessageContent:
        "Thanks for rotating the key! One more thing — does this invalidate existing webhooks?",
      recentMessages: [
        customer("Need to rotate our API key."),
        agent("Done — new key in your dashboard."),
        customer(
          "Thanks for rotating the key! One more thing — does this invalidate existing webhooks?",
        ),
      ],
      summary: sum({
        title: "API key rotation + webhook impact question",
        shortDescription:
          "Customer requested an API key rotation; rotation completed. Customer follows up asking whether existing webhooks remain valid.",
        keywords: ["api key", "rotation", "webhook", "auth"],
        entities: ["API keys", "webhooks", "dashboard"],
        expectedAction: "documentation / answer",
      }),
      currentStatus: 1,
      allowedStatuses: STATUSES,
    },
    expectedStatus: 1,
    expectedConfidenceBucket: "low",
  },
];
