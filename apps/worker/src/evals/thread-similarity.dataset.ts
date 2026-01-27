import type { InferLiveObject } from "@live-state/sync";
import type { schema } from "api/schema";

export const TEST_ORGANIZATION_ID = "eval_thread_similarity_org";

type Thread = InferLiveObject<
  typeof schema.thread,
  { messages: true; labels: { label: true } }
>;

export interface FakeThreadData {
  id: string;
  name: string;
  messages: string[];
  labels: string[];
  categoryId: string;
}

export interface TestCase {
  candidateThreadId: string;
  expectedSimilar: string[];
  expectedDissimilar: string[];
  description: string;
}

const BASE_DATE = new Date("2025-01-15T10:00:00Z");

// Fixed dataset of threads with varied formats, styles, and detail levels
const FIXED_THREADS: FakeThreadData[] = [
  // Test Case 1: Simple Similarity - Login Issues (thread_001 to thread_006)
  {
    id: "thread_001",
    name: "Can't log in with SSO",
    messages: [
      "Unable to sign in using SSO on our web app. Getting 401 error every time.",
    ],
    labels: ["auth", "login"],
    categoryId: "login_simple",
  },
  {
    id: "thread_002",
    name: "Login error 401 in Front Desk",
    messages: [
      "Hi team, Every attempt to sign in to Front Desk shows 401. Thanks for the help. (plan: Pro)",
    ],
    labels: ["auth", "login"],
    categoryId: "login_simple",
  },
  {
    id: "thread_003",
    name: "2FA codes rejected",
    messages: [
      "2FA codes from Google Authenticator are rejected even though the device time is synced.",
      "This started today after we enabled SSO for agent users.",
    ],
    labels: ["auth", "login"],
    categoryId: "login_simple",
  },
  {
    id: "thread_004",
    name: "Authentication failing",
    messages: [
      "I'm really stuck. Can't authenticate with email/password on mobile app. I've already cleared cache and it's still broken.",
      "This is blocking our support team and we need a workaround asap. Any ideas?",
    ],
    labels: ["auth", "login"],
    categoryId: "login_simple",
  },
  {
    id: "thread_005",
    name: "Sign in not working",
    messages: [
      "Issue summary: Login fails with 403 error\n\nSteps tried:\n1) logout/login\n2) check settings\n3) retry the flow",
      "Expected behavior: request succeeds.\nActual behavior: error persists (403).",
    ],
    labels: ["auth", "login"],
    categoryId: "login_simple",
  },
  {
    id: "thread_006",
    name: "SSO login broken",
    messages: [
      "SSO authentication not working on desktop app.\n\nLogs:\nGET /api/v1/sessions -> 401 invalid_token",
      "Environment: Chrome on Windows 11.",
    ],
    labels: ["auth", "login"],
    categoryId: "login_simple",
  },

  // Test Case 2: Simple Similarity - Payment Failures (thread_007 to thread_012)
  {
    id: "thread_007",
    name: "Card payment failed with 500",
    messages: ["Our card payment fails every time with 500."],
    labels: ["billing", "payment"],
    categoryId: "payment_simple",
  },
  {
    id: "thread_008",
    name: "Subscription payment declined",
    messages: [
      "Hi team, Subscription renewal is declined even with a valid card. Thanks for the help. (plan: Enterprise)",
    ],
    labels: ["billing", "payment"],
    categoryId: "payment_simple",
  },
  {
    id: "thread_009",
    name: "Billing update keeps failing",
    messages: [
      "Trying to update billing info but it never saves.",
      "We attempted with two cards and still see the same error.",
    ],
    labels: ["billing", "payment"],
    categoryId: "payment_simple",
  },
  {
    id: "thread_010",
    name: "Payment processing error",
    messages: [
      "I'm really stuck. Payment keeps getting rejected. I've already tried incognito and it's still broken.",
      "This is blocking billing ops and we need a workaround asap. Any ideas?",
    ],
    labels: ["billing", "payment"],
    categoryId: "payment_simple",
  },
  {
    id: "thread_011",
    name: "Credit card declined",
    messages: [
      "Issue summary: Card payment fails with 409\n\nSteps tried:\n1) logout/login\n2) check settings\n3) retry the flow",
      "Expected behavior: request succeeds.\nActual behavior: error persists (409).",
    ],
    labels: ["billing", "payment"],
    categoryId: "payment_simple",
  },
  {
    id: "thread_012",
    name: "Payment method update error",
    messages: [
      "Can't update payment method.\n\nLogs:\nPOST /api/v1/webhooks -> 504 gateway_timeout",
      "Environment: Safari on macOS 14.2.",
    ],
    labels: ["billing", "payment"],
    categoryId: "payment_simple",
  },

  // Test Case 3: Simple Similarity - Mobile Crashes (thread_013 to thread_018)
  {
    id: "thread_013",
    name: "App crashes on iPhone 13",
    messages: ["The app crashes on iPhone 13 running iOS 17.1."],
    labels: ["mobile", "crash"],
    categoryId: "mobile_crash_simple",
  },
  {
    id: "thread_014",
    name: "Mobile app freezes after update",
    messages: [
      "Hi team, After the latest update the app freezes on launch. Thanks for the help. (plan: Starter)",
    ],
    labels: ["mobile", "crash"],
    categoryId: "mobile_crash_simple",
  },
  {
    id: "thread_015",
    name: "Crash when opening thread details",
    messages: [
      "Opening any thread details causes a crash.",
      "Happens about 3 seconds after tapping a thread.",
    ],
    labels: ["mobile", "crash"],
    categoryId: "mobile_crash_simple",
  },
  {
    id: "thread_016",
    name: "iOS app keeps crashing",
    messages: [
      "I'm really stuck. App crashes immediately on iPad Pro. I've already reset the browser and it's still broken.",
      "This is blocking customer success and we need a workaround asap. Any ideas?",
    ],
    labels: ["mobile", "crash"],
    categoryId: "mobile_crash_simple",
  },
  {
    id: "thread_017",
    name: "App freeze on Android",
    messages: [
      "Issue summary: App freezes on Pixel 7\n\nSteps tried:\n1) logout/login\n2) check settings\n3) retry the flow",
      "Expected behavior: app opens normally.\nActual behavior: freeze persists.",
    ],
    labels: ["mobile", "crash"],
    categoryId: "mobile_crash_simple",
  },
  {
    id: "thread_018",
    name: "Mobile crash with stack trace",
    messages: [
      "App crashes on launch.\n\nLogs:\nFatalException: NullPointerException at ThreadActivity.onCreate",
      "Environment: Android 14.",
    ],
    labels: ["mobile", "crash"],
    categoryId: "mobile_crash_simple",
  },

  // Test Case 4: Harder Similarity - Performance Issues (thread_019 to thread_024)
  {
    id: "thread_019",
    name: "Page taking too long to load",
    messages: [
      "The dashboard is taking too long to load. Sometimes it takes 30+ seconds.",
    ],
    labels: ["performance", "latency"],
    categoryId: "performance_hard",
  },
  {
    id: "thread_020",
    name: "Slow response times",
    messages: [
      "Hi team, API responses are very slow. Thanks for the help. (plan: Pro)",
    ],
    labels: ["performance", "latency"],
    categoryId: "performance_hard",
  },
  {
    id: "thread_021",
    name: "Delay in loading threads",
    messages: [
      "There's a significant delay when loading threads. Messages take 10-15 minutes to appear.",
      "The delay started this morning and is getting worse.",
    ],
    labels: ["performance", "latency"],
    categoryId: "performance_hard",
  },
  {
    id: "thread_022",
    name: "Time to load is excessive",
    messages: [
      "I'm really stuck. The time to load pages is excessive. I've already cleared cache and it's still broken.",
      "This is blocking on-call and we need a workaround asap. Any ideas?",
    ],
    labels: ["performance", "latency"],
    categoryId: "performance_hard",
  },
  {
    id: "thread_023",
    name: "Performance degradation",
    messages: [
      "Issue summary: Pages loading slowly\n\nSteps tried:\n1) logout/login\n2) check settings\n3) retry the flow",
      "Expected behavior: fast load times.\nActual behavior: slow loading persists.",
    ],
    labels: ["performance", "latency"],
    categoryId: "performance_hard",
  },
  {
    id: "thread_024",
    name: "Slow performance with logs",
    messages: [
      "Performance is terrible.\n\nLogs:\nGET /api/v1/exports -> 500 internal_error",
      "Environment: Firefox on Windows 11.",
    ],
    labels: ["performance", "latency"],
    categoryId: "performance_hard",
  },

  // Test Case 5: Harder Similarity - Authentication Problems (thread_025 to thread_030)
  {
    id: "thread_025",
    name: "2FA not working",
    messages: ["Two-factor authentication codes aren't being accepted."],
    labels: ["auth", "2fa"],
    categoryId: "auth_hard",
  },
  {
    id: "thread_026",
    name: "SSO authentication issue",
    messages: [
      "Hi team, Single sign-on is failing for our team. Thanks for the help. (plan: Enterprise)",
    ],
    labels: ["auth", "sso"],
    categoryId: "auth_hard",
  },
  {
    id: "thread_027",
    name: "Password reset email never arrives",
    messages: [
      "Reset emails are not being delivered to our team.",
      "Checked spam folders and US-East mail filters, still nothing.",
    ],
    labels: ["auth", "password-reset"],
    categoryId: "auth_hard",
  },
  {
    id: "thread_028",
    name: "Can't authenticate",
    messages: [
      "I'm really stuck. Authentication is broken. I've already tried incognito and it's still broken.",
      "This is blocking our support team and we need a workaround asap. Any ideas?",
    ],
    labels: ["auth", "login"],
    categoryId: "auth_hard",
  },
  {
    id: "thread_029",
    name: "Auth token expired",
    messages: [
      "Issue summary: Auth tokens expiring too quickly\n\nSteps tried:\n1) logout/login\n2) check settings\n3) retry the flow",
      "Expected behavior: tokens last 24h.\nActual behavior: expire in minutes.",
    ],
    labels: ["auth", "token"],
    categoryId: "auth_hard",
  },
  {
    id: "thread_030",
    name: "Magic link not working",
    messages: [
      "Magic link authentication failing.\n\nLogs:\nGET /api/v1/sessions -> 401 invalid_token",
      "Environment: Edge on macOS 14.2.",
    ],
    labels: ["auth", "magic-link"],
    categoryId: "auth_hard",
  },

  // Test Case 6: Harder Similarity - Data Export Issues (thread_031 to thread_036)
  {
    id: "thread_031",
    name: "Exported CSV missing columns",
    messages: [
      "Our CSV export is missing key columns like 'created_at' and 'status'.",
    ],
    labels: ["export", "data"],
    categoryId: "export_hard",
  },
  {
    id: "thread_032",
    name: "Data export times out",
    messages: [
      "Hi team, Exports time out after a few minutes. Thanks for the help. (plan: Pro)",
    ],
    labels: ["export", "data"],
    categoryId: "export_hard",
  },
  {
    id: "thread_033",
    name: "Need scheduled export",
    messages: [
      "We need scheduled exports for reporting.",
      "We export weekly for billing ops.",
    ],
    labels: ["export", "data"],
    categoryId: "export_hard",
  },
  {
    id: "thread_034",
    name: "Export failing",
    messages: [
      "I'm really stuck. Can't export our data. I've already rotated API key and it's still broken.",
      "This is blocking customer success and we need a workaround asap. Any ideas?",
    ],
    labels: ["export", "data"],
    categoryId: "export_hard",
  },
  {
    id: "thread_035",
    name: "JSON export incomplete",
    messages: [
      "Issue summary: JSON export missing data\n\nSteps tried:\n1) logout/login\n2) check settings\n3) retry the flow",
      "Expected behavior: complete export.\nActual behavior: missing records.",
    ],
    labels: ["export", "data"],
    categoryId: "export_hard",
  },
  {
    id: "thread_036",
    name: "Export error with logs",
    messages: [
      "Export fails.\n\nLogs:\nGET /api/v1/exports -> 500 internal_error",
      "Environment: Chrome on Windows 11.",
    ],
    labels: ["export", "data"],
    categoryId: "export_hard",
  },

  // Test Case 7: Edge Case - Very Short/Vague (thread_037 to thread_042)
  {
    id: "thread_037",
    name: "Broken",
    messages: ["It's broken."],
    labels: ["bug"],
    categoryId: "edge_vague",
  },
  {
    id: "thread_038",
    name: "Not working",
    messages: ["Not working."],
    labels: ["bug"],
    categoryId: "edge_vague",
  },
  {
    id: "thread_039",
    name: "Help",
    messages: ["Need help."],
    labels: ["support"],
    categoryId: "edge_vague",
  },
  {
    id: "thread_040",
    name: "Issue",
    messages: ["Having an issue."],
    labels: ["bug"],
    categoryId: "edge_vague",
  },
  {
    id: "thread_041",
    name: "Problem",
    messages: ["There's a problem."],
    labels: ["bug"],
    categoryId: "edge_vague",
  },
  {
    id: "thread_042",
    name: "Error",
    messages: ["Getting an error."],
    labels: ["bug"],
    categoryId: "edge_vague",
  },

  // Test Case 8: Edge Case - Technical Details/Logs (thread_043 to thread_048)
  {
    id: "thread_043",
    name: "Error 500 with stack trace",
    messages: [
      "Getting 500 errors.\n\nStack trace:\nError: Cannot read property 'id' of undefined\n    at ThreadService.getThread (threads.js:45:12)\n    at async handler (api.js:123:8)\n    at async Router.handle (router.js:67:4)",
      "Environment: Node.js 18.17.0, production",
    ],
    labels: ["error", "technical"],
    categoryId: "edge_technical",
  },
  {
    id: "thread_044",
    name: "Database connection timeout",
    messages: [
      "Database queries timing out.\n\nLogs:\n[2025-01-15 10:23:45] ERROR: Connection timeout after 30s\n[2025-01-15 10:23:46] ERROR: Retry attempt 1 failed\n[2025-01-15 10:23:47] ERROR: Retry attempt 2 failed",
      "PostgreSQL 14.5, connection pool size: 20",
    ],
    labels: ["error", "technical"],
    categoryId: "edge_technical",
  },
  {
    id: "thread_045",
    name: "API error with full request/response",
    messages: [
      "API call failing.\n\nRequest:\nPOST /api/v1/threads\nHeaders: { Authorization: 'Bearer xxx', Content-Type: 'application/json' }\nBody: { name: 'Test', messages: [...] }\n\nResponse:\nStatus: 429\nBody: { error: 'rate_limit_exceeded', retry_after: 60 }",
    ],
    labels: ["error", "technical"],
    categoryId: "edge_technical",
  },
  {
    id: "thread_046",
    name: "Memory leak detected",
    messages: [
      "Memory usage growing.\n\nHeap dump analysis:\n- Thread objects: 45MB\n- Message cache: 120MB\n- Label index: 8MB\n\nGC logs show frequent full collections.",
    ],
    labels: ["error", "technical"],
    categoryId: "edge_technical",
  },
  {
    id: "thread_047",
    name: "Network error details",
    messages: [
      "Network issues.\n\nPacket capture:\n- DNS resolution: OK\n- TCP handshake: OK\n- TLS negotiation: FAILED\n- Error: certificate_verify_failed",
    ],
    labels: ["error", "technical"],
    categoryId: "edge_technical",
  },
  {
    id: "thread_048",
    name: "Performance metrics",
    messages: [
      "Slow performance.\n\nMetrics:\n- p50 latency: 2.3s\n- p95 latency: 8.7s\n- p99 latency: 15.2s\n- Error rate: 0.5%\n- Throughput: 120 req/s",
    ],
    labels: ["error", "technical"],
    categoryId: "edge_technical",
  },

  // Test Case 9: Edge Case - Typos and Informal Language (thread_049 to thread_054)
  {
    id: "thread_049",
    name: "cant login",
    messages: ["cant login, keeps sayin error"],
    labels: ["auth", "login"],
    categoryId: "edge_informal",
  },
  {
    id: "thread_050",
    name: "paymnet not workin",
    messages: ["paymnet not workin, card declind"],
    labels: ["billing", "payment"],
    categoryId: "edge_informal",
  },
  {
    id: "thread_051",
    name: "app crashin",
    messages: ["app keeps crashin on my phone"],
    labels: ["mobile", "crash"],
    categoryId: "edge_informal",
  },
  {
    id: "thread_052",
    name: "to slow",
    messages: ["its to slow, takin forever"],
    labels: ["performance", "latency"],
    categoryId: "edge_informal",
  },
  {
    id: "thread_053",
    name: "export brokn",
    messages: ["export brokn, missing stuff"],
    labels: ["export", "data"],
    categoryId: "edge_informal",
  },
  {
    id: "thread_054",
    name: "webhook not sendin",
    messages: ["webhook not sendin events"],
    labels: ["webhook", "delivery"],
    categoryId: "edge_informal",
  },

  // Test Case 10: Edge Case - Multiple Unrelated Issues (thread_055 to thread_060)
  {
    id: "thread_055",
    name: "Login and payment issues",
    messages: [
      "Having two problems: can't log in and also payment is failing. Not sure if related.",
    ],
    labels: ["auth", "billing"],
    categoryId: "edge_multiple",
  },
  {
    id: "thread_056",
    name: "Crash and slow performance",
    messages: [
      "App crashes sometimes and when it doesn't crash it's super slow. Both issues started today.",
    ],
    labels: ["mobile", "performance"],
    categoryId: "edge_multiple",
  },
  {
    id: "thread_057",
    name: "Export and webhook problems",
    messages: [
      "Exports are failing and webhooks aren't being delivered. Could these be connected?",
    ],
    labels: ["export", "webhook"],
    categoryId: "edge_multiple",
  },
  {
    id: "thread_058",
    name: "Auth and sync issues",
    messages: [
      "Authentication is broken and messages aren't syncing. Two separate problems I think.",
    ],
    labels: ["auth", "sync"],
    categoryId: "edge_multiple",
  },
  {
    id: "thread_059",
    name: "Multiple billing problems",
    messages: [
      "Invoice is wrong, payment failed, and can't update billing info. All billing related.",
    ],
    labels: ["billing"],
    categoryId: "edge_multiple",
  },
  {
    id: "thread_060",
    name: "Rate limit and performance",
    messages: [
      "Getting rate limited and the API is slow. Performance issues across the board.",
    ],
    labels: ["api", "performance"],
    categoryId: "edge_multiple",
  },

  // Test Case 11: Close but Distinct - Rate Limiting vs Throttling (thread_061 to thread_066)
  {
    id: "thread_061",
    name: "Getting 429s when listing threads",
    messages: ["We're seeing 429 responses after a few requests."],
    labels: ["api", "rate-limit"],
    categoryId: "rate_limit",
  },
  {
    id: "thread_062",
    name: "API rate limit triggered too quickly",
    messages: [
      "Hi team, API calls are rate limited far below the documented threshold. Thanks for the help. (plan: Pro)",
    ],
    labels: ["api", "rate-limit"],
    categoryId: "rate_limit",
  },
  {
    id: "thread_063",
    name: "Bulk import hitting rate limits",
    messages: [
      "Our integration hits rate limits during batch jobs.",
      "Requests are spaced at 2 per second but still throttled.",
    ],
    labels: ["api", "rate-limit"],
    categoryId: "rate_limit",
  },
  {
    id: "thread_064",
    name: "API throttling issues",
    messages: [
      "I'm really stuck. API is throttling our requests. I've already cleared cache and it's still broken.",
      "This is impacting our support team during business hours.",
    ],
    labels: ["api", "throttling"],
    categoryId: "rate_limit",
  },
  {
    id: "thread_065",
    name: "Too many requests error",
    messages: [
      "Issue summary: Getting 'too many requests' errors\n\nSteps tried:\n1) logout/login\n2) check settings\n3) retry the flow",
      "Expected behavior: normal rate limits.\nActual behavior: throttled immediately.",
    ],
    labels: ["api", "rate-limit"],
    categoryId: "rate_limit",
  },
  {
    id: "thread_066",
    name: "Request throttling",
    messages: [
      "Requests being throttled.\n\nLogs:\nPATCH /api/v1/threads -> 429 rate_limited",
      "Environment: Chrome on Windows 11.",
    ],
    labels: ["api", "throttling"],
    categoryId: "rate_limit",
  },

  // Test Case 12: Close but Distinct - Webhook Delays vs Sync Delays (thread_067 to thread_072)
  {
    id: "thread_067",
    name: "Webhooks are delayed by minutes",
    messages: ["Webhook events are delayed significantly."],
    labels: ["webhook", "delivery"],
    categoryId: "webhook_delay",
  },
  {
    id: "thread_068",
    name: "Webhook delivery stopped entirely",
    messages: [
      "Hi team, No webhook events are arriving in our endpoint. Thanks for the help. (plan: Enterprise)",
    ],
    labels: ["webhook", "delivery"],
    categoryId: "webhook_delay",
  },
  {
    id: "thread_069",
    name: "Retries not happening for failed webhooks",
    messages: [
      "Failed webhook deliveries are not being retried.",
      "We see 504s in our logs around this morning.",
    ],
    labels: ["webhook", "delivery"],
    categoryId: "webhook_delay",
  },
  {
    id: "thread_070",
    name: "Thread sync delayed between systems",
    messages: [
      "I'm really stuck. Thread sync is delayed between our CRM and Front Desk. I've already reset the browser and it's still broken.",
      "The delay started today and is getting worse.",
    ],
    labels: ["sync", "latency"],
    categoryId: "sync_delay",
  },
  {
    id: "thread_071",
    name: "New messages not syncing quickly",
    messages: [
      "Issue summary: Messages take 10-15 minutes to appear\n\nSteps tried:\n1) logout/login\n2) check settings\n3) retry the flow",
      "Expected behavior: instant sync.\nActual behavior: delay persists.",
    ],
    labels: ["sync", "latency"],
    categoryId: "sync_delay",
  },
  {
    id: "thread_072",
    name: "Sync backlog keeps growing",
    messages: [
      "Sync backlog growing.\n\nLogs:\nPOST /api/v1/webhooks -> 504 gateway_timeout",
      "Environment: Safari on macOS 14.2.",
    ],
    labels: ["sync", "latency"],
    categoryId: "sync_delay",
  },

  // Test Case 13: Close but Distinct - Invoice Issues vs Payment Issues (thread_073 to thread_082)
  {
    id: "thread_073",
    name: "Invoice total looks wrong for Pro",
    messages: ["Our invoice total seems higher than expected for Pro."],
    labels: ["billing", "invoice"],
    categoryId: "invoice_issue",
  },
  {
    id: "thread_074",
    name: "Duplicate invoice for last month",
    messages: [
      "Hi team, We received two invoices for the same period. Thanks for the help. (plan: Starter)",
    ],
    labels: ["billing", "invoice"],
    categoryId: "invoice_issue",
  },
  {
    id: "thread_075",
    name: "Need help understanding invoice breakdown",
    messages: [
      "The invoice shows extra seats that we did not add.",
      "We only have 5 active users but the invoice lists 9 seats.",
    ],
    labels: ["billing", "invoice"],
    categoryId: "invoice_issue",
  },
  {
    id: "thread_091",
    name: "Invoice charges incorrect",
    messages: [
      "Invoice charges don't match our usage. We're being billed for features we don't use.",
    ],
    labels: ["billing", "invoice"],
    categoryId: "invoice_issue",
  },
  {
    id: "thread_092",
    name: "Invoice missing discount",
    messages: [
      "Our invoice is missing the annual discount we were promised. The total is higher than it should be.",
    ],
    labels: ["billing", "invoice"],
    categoryId: "invoice_issue",
  },
  {
    id: "thread_099",
    name: "Invoice calculation error",
    messages: [
      "The invoice calculation seems wrong. We're on the Starter plan but being charged Pro rates.",
    ],
    labels: ["billing", "invoice"],
    categoryId: "invoice_issue",
  },
  {
    id: "thread_076",
    name: "Card payment failed with 500",
    messages: [
      "I'm really stuck. Our card payment fails every time with 500. I've already tried incognito and it's still broken.",
      "This is blocking billing ops and we need a workaround asap. Any ideas?",
    ],
    labels: ["billing", "payment"],
    categoryId: "payment_issue",
  },
  {
    id: "thread_077",
    name: "Subscription payment declined",
    messages: [
      "Issue summary: Subscription renewal declined\n\nSteps tried:\n1) logout/login\n2) check settings\n3) retry the flow",
      "Expected behavior: payment succeeds.\nActual behavior: decline persists.",
    ],
    labels: ["billing", "payment"],
    categoryId: "payment_issue",
  },
  {
    id: "thread_078",
    name: "Billing update keeps failing",
    messages: [
      "Can't update billing.\n\nLogs:\nPOST /api/v1/webhooks -> 504 gateway_timeout",
      "Environment: Firefox on Windows 11.",
    ],
    labels: ["billing", "payment"],
    categoryId: "payment_issue",
  },
  {
    id: "thread_093",
    name: "Payment method rejected",
    messages: [
      "Our payment method keeps getting rejected even though it's valid. Bank says the card is fine.",
    ],
    labels: ["billing", "payment"],
    categoryId: "payment_issue",
  },
  {
    id: "thread_094",
    name: "Automatic payment failed",
    messages: [
      "Automatic payment failed this month. We got an email saying payment couldn't be processed.",
    ],
    labels: ["billing", "payment"],
    categoryId: "payment_issue",
  },

  // Test Case 14: Close but Distinct - Feature Request vs Bug Report (thread_079 to thread_084, thread_095 to thread_098)
  {
    id: "thread_079",
    name: "Feature request: dark mode",
    messages: ["We'd like to request dark mode to improve workflows."],
    labels: ["feature-request"],
    categoryId: "feature_request",
  },
  {
    id: "thread_080",
    name: "Would love bulk labeling for the dashboard",
    messages: [
      "Hi team, Our team is asking for bulk labeling in the Front Desk. Thanks for the help. (plan: Pro)",
    ],
    labels: ["feature-request"],
    categoryId: "feature_request",
  },
  {
    id: "thread_081",
    name: "Any plans for custom SLAs?",
    messages: [
      "Is there a roadmap item for custom SLAs?",
      "This would save time for customer success.",
    ],
    labels: ["feature-request"],
    categoryId: "feature_request",
  },
  {
    id: "thread_095",
    name: "Feature request: export scheduling",
    messages: [
      "Would it be possible to add scheduled exports? We need weekly automated exports for our reporting.",
    ],
    labels: ["feature-request"],
    categoryId: "feature_request",
  },
  {
    id: "thread_096",
    name: "Request: API webhooks",
    messages: [
      "We'd love to have webhook support in the API. This would help us integrate with our internal tools.",
    ],
    labels: ["feature-request"],
    categoryId: "feature_request",
  },
  {
    id: "thread_100",
    name: "Feature suggestion: keyboard shortcuts",
    messages: [
      "Would be great to have keyboard shortcuts for common actions. Would speed up our workflow significantly.",
    ],
    labels: ["feature-request"],
    categoryId: "feature_request",
  },
  {
    id: "thread_082",
    name: "Dark mode not working",
    messages: [
      "I'm really stuck. Dark mode doesn't work. I've already cleared cache and it's still broken.",
      "This is blocking our support team and we need a workaround asap. Any ideas?",
    ],
    labels: ["bug", "ui"],
    categoryId: "bug_report",
  },
  {
    id: "thread_083",
    name: "Bulk actions broken",
    messages: [
      "Issue summary: Bulk labeling feature broken\n\nSteps tried:\n1) logout/login\n2) check settings\n3) retry the flow",
      "Expected behavior: bulk actions work.\nActual behavior: error persists.",
    ],
    labels: ["bug", "ui"],
    categoryId: "bug_report",
  },
  {
    id: "thread_084",
    name: "SLA settings not saving",
    messages: [
      "SLA settings not saving.\n\nLogs:\nPATCH /api/v1/threads -> 429 rate_limited",
      "Environment: Chrome on macOS 14.2.",
    ],
    labels: ["bug", "settings"],
    categoryId: "bug_report",
  },
  {
    id: "thread_097",
    name: "Export feature broken",
    messages: [
      "The export feature is broken. When I try to export, it fails with an error message.",
    ],
    labels: ["bug", "export"],
    categoryId: "bug_report",
  },
  {
    id: "thread_098",
    name: "Webhooks not firing",
    messages: [
      "Webhooks aren't being sent even though they're configured. This used to work but stopped yesterday.",
    ],
    labels: ["bug", "webhook"],
    categoryId: "bug_report",
  },

  // Test Case 15: Close but Distinct - Mobile Crash vs Desktop Crash (thread_085 to thread_090)
  {
    id: "thread_085",
    name: "App crashes on iPhone 13",
    messages: ["The app crashes on iPhone 13 running iOS 17.1."],
    labels: ["mobile", "crash"],
    categoryId: "mobile_crash",
  },
  {
    id: "thread_086",
    name: "Mobile app freezes after update",
    messages: [
      "Hi team, After the latest update the app freezes on launch. Thanks for the help. (plan: Starter)",
    ],
    labels: ["mobile", "crash"],
    categoryId: "mobile_crash",
  },
  {
    id: "thread_087",
    name: "Crash when opening thread details on mobile",
    messages: [
      "Opening any thread details causes a crash on mobile.",
      "Happens about 3 seconds after tapping a thread.",
    ],
    labels: ["mobile", "crash"],
    categoryId: "mobile_crash",
  },
  {
    id: "thread_088",
    name: "Desktop app crashes on Windows",
    messages: [
      "I'm really stuck. Desktop app crashes on Windows 11. I've already reset the browser and it's still broken.",
      "This is blocking on-call and we need a workaround asap. Any ideas?",
    ],
    labels: ["desktop", "crash"],
    categoryId: "desktop_crash",
  },
  {
    id: "thread_089",
    name: "Mac app freezes",
    messages: [
      "Issue summary: Desktop app freezes on macOS\n\nSteps tried:\n1) logout/login\n2) check settings\n3) retry the flow",
      "Expected behavior: app works normally.\nActual behavior: freeze persists.",
    ],
    labels: ["desktop", "crash"],
    categoryId: "desktop_crash",
  },
  {
    id: "thread_090",
    name: "Desktop crash with error",
    messages: [
      "Desktop app crashes.\n\nLogs:\nFatalException: Segmentation fault at WindowManager.createWindow",
      "Environment: macOS 14.2.",
    ],
    labels: ["desktop", "crash"],
    categoryId: "desktop_crash",
  },
];

const buildTestCases = (): TestCase[] => {
  return [
    // Test Case 1: Simple Similarity - Login Issues
    {
      description: "Simple similarity: Login issues with SSO",
      candidateThreadId: "thread_001",
      expectedSimilar: [
        "thread_002",
        "thread_006",
        "thread_026",
        "thread_030",
        "thread_049",
      ],
      expectedDissimilar: ["thread_007", "thread_013", "thread_019"],
    },
    // Test Case 2: Simple Similarity - Payment Failures
    {
      description: "Simple similarity: Payment failures",
      candidateThreadId: "thread_007",
      expectedSimilar: [
        "thread_076",
        "thread_011",
        "thread_050",
        "thread_036",
        "thread_010",
      ],
      expectedDissimilar: ["thread_001", "thread_013", "thread_019"],
    },
    // Test Case 3: Simple Similarity - Mobile Crashes
    {
      description: "Simple similarity: Mobile app crashes",
      candidateThreadId: "thread_013",
      expectedSimilar: [
        "thread_051",
        "thread_085",
        "thread_016",
        "thread_087",
        "thread_018",
      ],
      expectedDissimilar: ["thread_001", "thread_007", "thread_019"],
    },
    // Test Case 4: Harder Similarity - Performance Issues
    {
      description: "Harder similarity: Performance issues (different wording)",
      candidateThreadId: "thread_019",
      expectedSimilar: [
        "thread_020",
        "thread_021",
        "thread_022",
        "thread_023",
        "thread_048",
      ],
      expectedDissimilar: ["thread_001", "thread_007", "thread_013"],
    },
    // Test Case 5: Harder Similarity - Authentication Problems
    {
      description:
        "Harder similarity: Authentication problems (2FA, SSO, password reset)",
      candidateThreadId: "thread_025",
      expectedSimilar: [
        "thread_003",
        "thread_026",
        "thread_027",
        "thread_028",
        "thread_029",
        "thread_030",
      ],
      expectedDissimilar: ["thread_007", "thread_013", "thread_019"],
    },
    // Test Case 6: Harder Similarity - Data Export Issues
    {
      description:
        "Harder similarity: Data export issues (missing data, timeouts, format)",
      candidateThreadId: "thread_031",
      expectedSimilar: [
        "thread_053",
        "thread_032",
        "thread_033",
        "thread_034",
        "thread_035",
        "thread_036",
      ],
      expectedDissimilar: ["thread_001", "thread_007", "thread_013"],
    },
    // Test Case 7: Edge Case - Very Short/Vague
    {
      description: "Edge case: Very short/vague thread",
      candidateThreadId: "thread_037",
      expectedSimilar: [
        "thread_038",
        "thread_039",
        "thread_040",
        "thread_041",
        "thread_042",
      ],
      expectedDissimilar: ["thread_001", "thread_007", "thread_013"],
    },
    // Test Case 8: Edge Case - Technical Details/Logs
    {
      description: "Edge case: Thread with lots of technical details and logs",
      candidateThreadId: "thread_043",
      expectedSimilar: ["thread_036", "thread_024", "thread_015"],
      expectedDissimilar: ["thread_001", "thread_007", "thread_037"],
    },
    // Test Case 9: Edge Case - Typos and Informal Language
    {
      description: "Edge case: Thread with typos and informal language",
      candidateThreadId: "thread_049",
      expectedSimilar: [
        "thread_005",
        "thread_002",
        "thread_026",
        "thread_028",
        "thread_001",
      ],
      expectedDissimilar: ["thread_007", "thread_043"],
    },
    // Test Case 10: Edge Case - Multiple Unrelated Issues
    {
      description: "Edge case: Thread mentioning multiple unrelated issues",
      candidateThreadId: "thread_055",
      expectedSimilar: [
        "thread_056",
        "thread_057",
        "thread_058",
        "thread_059",
        "thread_060",
      ],
      expectedDissimilar: ["thread_001", "thread_007", "thread_013"],
    },
    // Test Case 11: Close but Distinct - Rate Limiting vs Throttling
    {
      description:
        "Close but distinct: Rate limiting vs throttling (similar concept, different terminology)",
      candidateThreadId: "thread_061",
      expectedSimilar: [
        "thread_045",
        "thread_064",
        "thread_084",
        "thread_062",
        "thread_060",
      ],
      expectedDissimilar: ["thread_067", "thread_019", "thread_001"],
    },
    // Test Case 12: Close but Distinct - Webhook Delays vs Sync Delays
    {
      description:
        "Close but distinct: Webhook delays vs sync delays (both about delays but different systems)",
      candidateThreadId: "thread_067",
      expectedSimilar: [
        "thread_068",
        "thread_069",
        "thread_070",
        "thread_071",
        "thread_072",
      ],
      expectedDissimilar: ["thread_061", "thread_001", "thread_007"],
    },
    // Test Case 13: Close but Distinct - Invoice Issues vs Payment Issues
    {
      description:
        "Close but distinct: Invoice issues vs payment issues (both billing but different problems)",
      candidateThreadId: "thread_073",
      expectedSimilar: [
        "thread_074",
        "thread_075",
        "thread_091",
        "thread_092",
        "thread_099",
      ],
      expectedDissimilar: [
        "thread_076",
        "thread_077",
        "thread_078",
        "thread_093",
        "thread_094",
        "thread_001",
        "thread_013",
        "thread_019",
      ],
    },
    // Test Case 14: Close but Distinct - Feature Request vs Bug Report
    {
      description:
        "Close but distinct: Feature request vs bug report (similar need but different framing)",
      candidateThreadId: "thread_079",
      expectedSimilar: [
        "thread_080",
        "thread_081",
        "thread_095",
        "thread_096",
        "thread_100",
      ],
      expectedDissimilar: [
        "thread_082",
        "thread_083",
        "thread_084",
        "thread_097",
        "thread_098",
        "thread_001",
        "thread_007",
        "thread_013",
      ],
    },
    // Test Case 15: Close but Distinct - Mobile Crash vs Desktop Crash
    {
      description:
        "Close but distinct: Mobile crash vs desktop crash (same issue, different platform)",
      candidateThreadId: "thread_085",
      expectedSimilar: [
        "thread_086",
        "thread_087",
        "thread_088",
        "thread_089",
        "thread_090",
      ],
      expectedDissimilar: ["thread_001", "thread_007", "thread_019"],
    },
  ];
};

export const buildThreadSimilarityDataset = () => {
  const threads = FIXED_THREADS;
  const groups: Record<string, string[]> = {};

  // Build groups from threads
  for (const thread of threads) {
    const categoryId = thread.categoryId;
    const group = groups[categoryId] ?? [];
    group.push(thread.id);
    groups[categoryId] = group;
  }

  const testCases = buildTestCases();
  return { threads, groups, testCases };
};

export const convertToThread = (data: FakeThreadData): Thread => {
  const numericId = Number(data.id.split("_")[1] ?? 0);
  const offsetMinutes = Number.isFinite(numericId) ? numericId : 0;
  const createdAt = new Date(BASE_DATE.getTime() + offsetMinutes * 60 * 1000);

  return {
    id: data.id,
    name: data.name,
    organizationId: TEST_ORGANIZATION_ID,
    authorId: "author_eval",
    createdAt,
    deletedAt: null,
    discordChannelId: null,
    externalIssueId: null,
    externalPrId: null,
    status: 0,
    priority: 1,
    assignedUserId: null,
    externalId: null,
    externalOrigin: null,
    externalMetadataStr: null,
    messages: data.messages.map((content, index) => ({
      id: `msg_${data.id}_${index}`,
      threadId: data.id,
      authorId: "author_eval",
      content,
      createdAt: new Date(createdAt.getTime() + index * 1000),
      origin: null,
      externalMessageId: null,
      markedAsAnswer: false,
    })),
    labels: data.labels.map((labelName) => ({
      id: `label_${data.id}_${labelName}`,
      threadId: data.id,
      labelId: `label_${labelName}`,
      enabled: true,
      label: {
        id: `label_${labelName}`,
        name: labelName,
        color: "#4b5563",
        createdAt,
        updatedAt: createdAt,
        organizationId: TEST_ORGANIZATION_ID,
        enabled: true,
      },
    })),
  };
};
