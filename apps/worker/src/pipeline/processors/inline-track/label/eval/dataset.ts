import type { ClassifyLabelInput } from "../classify";

export type ExpectedConfidenceBucket = "high" | "low" | "none";

export interface LabelClassifierTestCase {
  name: string;
  input: ClassifyLabelInput;
  expectedLabel: string | null;
  expectedConfidenceBucket: ExpectedConfidenceBucket;
}

const STANDARD_LABELS = [
  { id: "lbl_bug", name: "bug" },
  { id: "lbl_billing", name: "billing" },
  { id: "lbl_feature_request", name: "feature request" },
  { id: "lbl_account", name: "account" },
  { id: "lbl_docs", name: "documentation" },
  { id: "lbl_integration", name: "integration" },
];

const noSummary = null;

export const labelClassifierDataset: LabelClassifierTestCase[] = [
  // Clear signal — bug
  {
    expectedConfidenceBucket: "high",
    expectedLabel: "lbl_bug",
    input: {
      firstMessageContent:
        "Since the last release the app crashes immediately with a NullPointerException at boot. Repro: open the app, splash screen appears, then it closes. Logs attached.",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "App crashes on startup",
    },
    name: "clear bug: stack trace + repro",
  },
  {
    expectedConfidenceBucket: "high",
    expectedLabel: "lbl_bug",
    input: {
      firstMessageContent:
        "Every call to POST /threads returns a 500 since this morning. Other endpoints work fine.",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "POST /threads returns 500",
    },
    name: "clear bug: 500 from API",
  },
  // Clear signal — billing
  {
    expectedConfidenceBucket: "high",
    expectedLabel: "lbl_billing",
    input: {
      firstMessageContent:
        "My card was charged twice on Nov 3rd for the Pro plan. I only have one subscription. Please refund the duplicate charge.",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "Charged twice for the same month",
    },
    name: "clear billing: double charge",
  },
  {
    expectedConfidenceBucket: "high",
    expectedLabel: "lbl_billing",
    input: {
      firstMessageContent:
        "Can you send me an invoice with our company VAT id on it? Email is finance@acme.com.",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "Need a VAT invoice for last month",
    },
    name: "clear billing: invoice question",
  },
  // Clear signal — feature request
  {
    expectedConfidenceBucket: "high",
    expectedLabel: "lbl_feature_request",
    input: {
      firstMessageContent:
        "It would be great if we could export the threads list to CSV. Right now we can't share data with our analytics team.",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "Add CSV export",
    },
    name: "clear feature request",
  },
  // Clear signal — account
  {
    expectedConfidenceBucket: "high",
    expectedLabel: "lbl_account",
    input: {
      firstMessageContent:
        "I tried to log in this morning and it says my account is locked. I don't see any emails about this. Can you unlock it?",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "Can't log in",
    },
    name: "clear account: locked out",
  },
  // Clear signal — docs
  {
    expectedConfidenceBucket: "high",
    expectedLabel: "lbl_docs",
    input: {
      firstMessageContent:
        "The webhooks doc page jumps from creating the URL to verifying signatures and doesn't mention the secret rotation step.",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "Webhook setup docs are missing steps",
    },
    name: "clear docs: instructions unclear",
  },
  // Clear signal — integration
  {
    expectedConfidenceBucket: "high",
    expectedLabel: "lbl_integration",
    input: {
      firstMessageContent:
        "Since yesterday the FrontDesk Slack bot stopped posting new threads into #support. The Slack integration is still listed as enabled.",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "Slack integration stopped working",
    },
    name: "clear integration: Slack not posting",
  },
  // Ambiguous — null expected
  {
    expectedConfidenceBucket: "none",
    expectedLabel: null,
    input: {
      firstMessageContent: "Hi there!",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "hello",
    },
    name: "ambiguous: greeting",
  },
  {
    expectedConfidenceBucket: "low",
    expectedLabel: null,
    input: {
      firstMessageContent: "Not sure what's going on but it's not working.",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "Something is wrong",
    },
    name: "ambiguous: vague complaint",
  },
  {
    expectedConfidenceBucket: "none",
    expectedLabel: null,
    input: {
      firstMessageContent: "Thanks for the help earlier!",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: null,
    },
    name: "ambiguous: thanks-only message",
  },
  // Multi-label plausible — should still pick one
  {
    expectedConfidenceBucket: "high",
    expectedLabel: "lbl_bug",
    input: {
      firstMessageContent:
        "When I click 'Manage subscription' the page throws a 500. I'm trying to update my card before it expires.",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "Subscription page errors out",
    },
    name: "multi-label: billing bug",
  },
  {
    expectedConfidenceBucket: "high",
    expectedLabel: "lbl_integration",
    input: {
      firstMessageContent:
        "The instructions for installing the GitHub app don't say what scopes we need. Tried it and it failed.",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "GitHub integration setup unclear",
    },
    name: "multi-label: docs/integration",
  },
  // No-match: no fitting label
  {
    expectedConfidenceBucket: "none",
    expectedLabel: null,
    input: {
      firstMessageContent:
        "Are you hiring senior backend engineers? I saw a post on LinkedIn but the link is broken.",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "Job opening?",
    },
    name: "no fitting label: HR question",
  },
  // Already-applied case — covered at processor layer, but include here so the
  // model still picks the same label; the processor's skip path is exercised
  // by the smoke test, not the eval.
  {
    expectedConfidenceBucket: "high",
    expectedLabel: "lbl_billing",
    input: {
      firstMessageContent:
        "Please refund my last invoice; we cancelled the plan.",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "Refund request",
    },
    name: "already-applied billing label still picked by classifier",
  },
  // Small label set
  {
    expectedConfidenceBucket: "high",
    expectedLabel: "lbl_billing",
    input: {
      firstMessageContent:
        "Could you resend the receipt for the September payment?",
      orgLabels: [
        { id: "lbl_bug", name: "bug" },
        { id: "lbl_billing", name: "billing" },
      ],
      summary: noSummary,
      threadName: "Need a copy of last receipt",
    },
    name: "small label set: only bug + billing",
  },

  // --- Off-topic / decline cases -----------------------------------------
  {
    expectedConfidenceBucket: "none",
    expectedLabel: null,
    input: {
      firstMessageContent:
        "Hey, I run growth at Acme. Would love to chat about a partnership and a possible co-marketing campaign. Got 15 minutes this week?",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "Quick question about your roadmap",
    },
    name: "off-topic: sales pitch",
  },
  {
    expectedConfidenceBucket: "none",
    expectedLabel: null,
    input: {
      firstMessageContent:
        "I noticed your site could use SEO improvements. We offer guest post placements on DA50+ sites starting at $50.",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "Boost your rankings",
    },
    name: "off-topic: SEO spam",
  },
  {
    expectedConfidenceBucket: "none",
    expectedLabel: null,
    input: {
      firstMessageContent:
        "Just wanted to say the new dashboard is amazing. Keep it up!",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "Love the product",
    },
    name: "off-topic: praise only",
  },
  {
    expectedConfidenceBucket: "none",
    expectedLabel: null,
    input: {
      firstMessageContent: "test",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "asdf",
    },
    name: "off-topic: weird single token",
  },

  // --- Bug-on-surface cases (failure symptom wins) -----------------------
  {
    expectedConfidenceBucket: "high",
    expectedLabel: "lbl_bug",
    input: {
      firstMessageContent:
        "Connecting Slack works up to the consent screen, then we get a 500 from your callback URL.",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "Slack OAuth returns 500",
    },
    name: "bug on integration surface",
  },
  {
    expectedConfidenceBucket: "high",
    expectedLabel: "lbl_bug",
    input: {
      firstMessageContent:
        "I requested a password reset, got the email, but the link in it leads to a 404 page.",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "Password reset link 404s",
    },
    name: "bug on account surface",
  },

  // --- Genuine surface questions (not bugs) ------------------------------
  {
    expectedConfidenceBucket: "high",
    expectedLabel: "lbl_account",
    input: {
      firstMessageContent:
        "I lost my phone and can't get into my account anymore. How do I reset 2FA?",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "Lost my 2FA device",
    },
    name: "account question: 2FA reset",
  },
  {
    expectedConfidenceBucket: "high",
    expectedLabel: "lbl_integration",
    input: {
      firstMessageContent:
        "Do you support GitHub Enterprise (self-hosted)? If yes, what URL format should I use?",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "How do I connect GitHub Enterprise?",
    },
    name: "integration question: setup walk-through",
  },

  // --- Multi-label plausible: pick the symptom ---------------------------
  {
    name: "multi-label: docs vs feature_request",
    input: {
      firstMessageContent:
        "I don't see anything about bulk-importing threads via CSV in your help center. Is it documented somewhere or does it not exist yet?",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "Bulk import is missing from the docs",
    },
    // Reasonable either way; treat as docs since user is asking about
    // existence rather than requesting the feature outright.
    expectedLabel: "lbl_docs",
    expectedConfidenceBucket: "high",
  },

  // --- Non-English ------------------------------------------------------
  {
    expectedConfidenceBucket: "high",
    expectedLabel: "lbl_bug",
    input: {
      firstMessageContent:
        "Desde la última actualización, la aplicación se cierra inmediatamente al abrirla. He probado reinstalándola.",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "La app se cierra al iniciar",
    },
    name: "non-english: bug in spanish",
  },
  {
    expectedConfidenceBucket: "high",
    expectedLabel: "lbl_billing",
    input: {
      firstMessageContent:
        "Pourriez-vous me renvoyer la facture pour octobre? Mon équipe comptabilité en a besoin.",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "Facture du mois dernier",
    },
    name: "non-english: billing in french",
  },

  // --- Long, rambling, but clear ----------------------------------------
  {
    expectedConfidenceBucket: "high",
    expectedLabel: "lbl_feature_request",
    input: {
      firstMessageContent:
        "Hey team, hope you're doing well. We've been using the product for about 6 months now and overall it's been great. One thing that's bugging us though is that there's no way to schedule recurring CSV exports. We have a weekly board meeting and currently someone manually exports the data every Monday morning. Would be amazing if we could just set a schedule. Anyway, just wanted to share. Cheers!",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "Some thoughts about exports",
    },
    name: "rambling but clear: feature request",
  },

  // --- Very short but clear ---------------------------------------------
  {
    expectedConfidenceBucket: "high",
    expectedLabel: "lbl_bug",
    input: {
      firstMessageContent: "500 every time I try to log in.",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "500 on login",
    },
    name: "very short: bug",
  },

  // --- Ambiguous: low confidence expected -------------------------------
  {
    name: "ambiguous: cancellation reason unclear",
    input: {
      firstMessageContent: "We're cancelling, please confirm.",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "Cancelling",
    },
    // Could be billing (subscription cancellation), could be null. The
    // message is bare; the closest reasonable label is billing but with
    // low confidence — borderline.
    expectedLabel: "lbl_billing",
    expectedConfidenceBucket: "low",
  },

  // --- Account vs login bug edge case -----------------------------------
  {
    expectedConfidenceBucket: "high",
    expectedLabel: "lbl_account",
    input: {
      firstMessageContent:
        "I think I got locked out of the admin console after too many failed logins. Can you reset the lockout?",
      orgLabels: STANDARD_LABELS,
      summary: noSummary,
      threadName: "Locked out of admin console",
    },
    name: "account: locked out, no error mentioned",
  },
];
