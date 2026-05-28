import type { ClassifyLabelInput } from "../classify";

export type ExpectedConfidenceBucket = "high" | "low" | "none";

export type LabelClassifierTestCase = {
  name: string;
  input: ClassifyLabelInput;
  expectedLabel: string | null;
  expectedConfidenceBucket: ExpectedConfidenceBucket;
};

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
    name: "clear bug: stack trace + repro",
    input: {
      threadName: "App crashes on startup",
      firstMessageContent:
        "Since the last release the app crashes immediately with a NullPointerException at boot. Repro: open the app, splash screen appears, then it closes. Logs attached.",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: "lbl_bug",
    expectedConfidenceBucket: "high",
  },
  {
    name: "clear bug: 500 from API",
    input: {
      threadName: "POST /threads returns 500",
      firstMessageContent:
        "Every call to POST /threads returns a 500 since this morning. Other endpoints work fine.",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: "lbl_bug",
    expectedConfidenceBucket: "high",
  },
  // Clear signal — billing
  {
    name: "clear billing: double charge",
    input: {
      threadName: "Charged twice for the same month",
      firstMessageContent:
        "My card was charged twice on Nov 3rd for the Pro plan. I only have one subscription. Please refund the duplicate charge.",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: "lbl_billing",
    expectedConfidenceBucket: "high",
  },
  {
    name: "clear billing: invoice question",
    input: {
      threadName: "Need a VAT invoice for last month",
      firstMessageContent:
        "Can you send me an invoice with our company VAT id on it? Email is finance@acme.com.",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: "lbl_billing",
    expectedConfidenceBucket: "high",
  },
  // Clear signal — feature request
  {
    name: "clear feature request",
    input: {
      threadName: "Add CSV export",
      firstMessageContent:
        "It would be great if we could export the threads list to CSV. Right now we can't share data with our analytics team.",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: "lbl_feature_request",
    expectedConfidenceBucket: "high",
  },
  // Clear signal — account
  {
    name: "clear account: locked out",
    input: {
      threadName: "Can't log in",
      firstMessageContent:
        "I tried to log in this morning and it says my account is locked. I don't see any emails about this. Can you unlock it?",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: "lbl_account",
    expectedConfidenceBucket: "high",
  },
  // Clear signal — docs
  {
    name: "clear docs: instructions unclear",
    input: {
      threadName: "Webhook setup docs are missing steps",
      firstMessageContent:
        "The webhooks doc page jumps from creating the URL to verifying signatures and doesn't mention the secret rotation step.",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: "lbl_docs",
    expectedConfidenceBucket: "high",
  },
  // Clear signal — integration
  {
    name: "clear integration: Slack not posting",
    input: {
      threadName: "Slack integration stopped working",
      firstMessageContent:
        "Since yesterday the FrontDesk Slack bot stopped posting new threads into #support. The Slack integration is still listed as enabled.",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: "lbl_integration",
    expectedConfidenceBucket: "high",
  },
  // Ambiguous — null expected
  {
    name: "ambiguous: greeting",
    input: {
      threadName: "hello",
      firstMessageContent: "Hi there!",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: null,
    expectedConfidenceBucket: "none",
  },
  {
    name: "ambiguous: vague complaint",
    input: {
      threadName: "Something is wrong",
      firstMessageContent: "Not sure what's going on but it's not working.",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: null,
    expectedConfidenceBucket: "low",
  },
  {
    name: "ambiguous: thanks-only message",
    input: {
      threadName: null,
      firstMessageContent: "Thanks for the help earlier!",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: null,
    expectedConfidenceBucket: "none",
  },
  // Multi-label plausible — should still pick one
  {
    name: "multi-label: billing bug",
    input: {
      threadName: "Subscription page errors out",
      firstMessageContent:
        "When I click 'Manage subscription' the page throws a 500. I'm trying to update my card before it expires.",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: "lbl_bug",
    expectedConfidenceBucket: "high",
  },
  {
    name: "multi-label: docs/integration",
    input: {
      threadName: "GitHub integration setup unclear",
      firstMessageContent:
        "The instructions for installing the GitHub app don't say what scopes we need. Tried it and it failed.",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: "lbl_integration",
    expectedConfidenceBucket: "high",
  },
  // No-match: no fitting label
  {
    name: "no fitting label: HR question",
    input: {
      threadName: "Job opening?",
      firstMessageContent:
        "Are you hiring senior backend engineers? I saw a post on LinkedIn but the link is broken.",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: null,
    expectedConfidenceBucket: "none",
  },
  // Already-applied case — covered at processor layer, but include here so the
  // model still picks the same label; the processor's skip path is exercised
  // by the smoke test, not the eval.
  {
    name: "already-applied billing label still picked by classifier",
    input: {
      threadName: "Refund request",
      firstMessageContent: "Please refund my last invoice; we cancelled the plan.",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: "lbl_billing",
    expectedConfidenceBucket: "high",
  },
  // Small label set
  {
    name: "small label set: only bug + billing",
    input: {
      threadName: "Need a copy of last receipt",
      firstMessageContent: "Could you resend the receipt for the September payment?",
      summary: noSummary,
      orgLabels: [
        { id: "lbl_bug", name: "bug" },
        { id: "lbl_billing", name: "billing" },
      ],
    },
    expectedLabel: "lbl_billing",
    expectedConfidenceBucket: "high",
  },

  // --- Off-topic / decline cases -----------------------------------------
  {
    name: "off-topic: sales pitch",
    input: {
      threadName: "Quick question about your roadmap",
      firstMessageContent:
        "Hey, I run growth at Acme. Would love to chat about a partnership and a possible co-marketing campaign. Got 15 minutes this week?",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: null,
    expectedConfidenceBucket: "none",
  },
  {
    name: "off-topic: SEO spam",
    input: {
      threadName: "Boost your rankings",
      firstMessageContent:
        "I noticed your site could use SEO improvements. We offer guest post placements on DA50+ sites starting at $50.",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: null,
    expectedConfidenceBucket: "none",
  },
  {
    name: "off-topic: praise only",
    input: {
      threadName: "Love the product",
      firstMessageContent:
        "Just wanted to say the new dashboard is amazing. Keep it up!",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: null,
    expectedConfidenceBucket: "none",
  },
  {
    name: "off-topic: weird single token",
    input: {
      threadName: "asdf",
      firstMessageContent: "test",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: null,
    expectedConfidenceBucket: "none",
  },

  // --- Bug-on-surface cases (failure symptom wins) -----------------------
  {
    name: "bug on integration surface",
    input: {
      threadName: "Slack OAuth returns 500",
      firstMessageContent:
        "Connecting Slack works up to the consent screen, then we get a 500 from your callback URL.",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: "lbl_bug",
    expectedConfidenceBucket: "high",
  },
  {
    name: "bug on account surface",
    input: {
      threadName: "Password reset link 404s",
      firstMessageContent:
        "I requested a password reset, got the email, but the link in it leads to a 404 page.",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: "lbl_bug",
    expectedConfidenceBucket: "high",
  },

  // --- Genuine surface questions (not bugs) ------------------------------
  {
    name: "account question: 2FA reset",
    input: {
      threadName: "Lost my 2FA device",
      firstMessageContent:
        "I lost my phone and can't get into my account anymore. How do I reset 2FA?",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: "lbl_account",
    expectedConfidenceBucket: "high",
  },
  {
    name: "integration question: setup walk-through",
    input: {
      threadName: "How do I connect GitHub Enterprise?",
      firstMessageContent:
        "Do you support GitHub Enterprise (self-hosted)? If yes, what URL format should I use?",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: "lbl_integration",
    expectedConfidenceBucket: "high",
  },

  // --- Multi-label plausible: pick the symptom ---------------------------
  {
    name: "multi-label: docs vs feature_request",
    input: {
      threadName: "Bulk import is missing from the docs",
      firstMessageContent:
        "I don't see anything about bulk-importing threads via CSV in your help center. Is it documented somewhere or does it not exist yet?",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    // Reasonable either way; treat as docs since user is asking about
    // existence rather than requesting the feature outright.
    expectedLabel: "lbl_docs",
    expectedConfidenceBucket: "high",
  },

  // --- Non-English ------------------------------------------------------
  {
    name: "non-english: bug in spanish",
    input: {
      threadName: "La app se cierra al iniciar",
      firstMessageContent:
        "Desde la última actualización, la aplicación se cierra inmediatamente al abrirla. He probado reinstalándola.",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: "lbl_bug",
    expectedConfidenceBucket: "high",
  },
  {
    name: "non-english: billing in french",
    input: {
      threadName: "Facture du mois dernier",
      firstMessageContent:
        "Pourriez-vous me renvoyer la facture pour octobre? Mon équipe comptabilité en a besoin.",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: "lbl_billing",
    expectedConfidenceBucket: "high",
  },

  // --- Long, rambling, but clear ----------------------------------------
  {
    name: "rambling but clear: feature request",
    input: {
      threadName: "Some thoughts about exports",
      firstMessageContent:
        "Hey team, hope you're doing well. We've been using the product for about 6 months now and overall it's been great. One thing that's bugging us though is that there's no way to schedule recurring CSV exports. We have a weekly board meeting and currently someone manually exports the data every Monday morning. Would be amazing if we could just set a schedule. Anyway, just wanted to share. Cheers!",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: "lbl_feature_request",
    expectedConfidenceBucket: "high",
  },

  // --- Very short but clear ---------------------------------------------
  {
    name: "very short: bug",
    input: {
      threadName: "500 on login",
      firstMessageContent: "500 every time I try to log in.",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: "lbl_bug",
    expectedConfidenceBucket: "high",
  },

  // --- Ambiguous: low confidence expected -------------------------------
  {
    name: "ambiguous: cancellation reason unclear",
    input: {
      threadName: "Cancelling",
      firstMessageContent:
        "We're cancelling, please confirm.",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    // Could be billing (subscription cancellation), could be null. The
    // message is bare; the closest reasonable label is billing but with
    // low confidence — borderline.
    expectedLabel: "lbl_billing",
    expectedConfidenceBucket: "low",
  },

  // --- Account vs login bug edge case -----------------------------------
  {
    name: "account: locked out, no error mentioned",
    input: {
      threadName: "Locked out of admin console",
      firstMessageContent:
        "I think I got locked out of the admin console after too many failed logins. Can you reset the lockout?",
      summary: noSummary,
      orgLabels: STANDARD_LABELS,
    },
    expectedLabel: "lbl_account",
    expectedConfidenceBucket: "high",
  },
];
