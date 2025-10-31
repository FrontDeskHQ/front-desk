import { DodoPayments } from "dodopayments/client";

export const dodopayments = process.env.DODO_PAYMENTS_API_KEY
  ? new DodoPayments({
      bearerToken: process.env.DODO_PAYMENTS_API_KEY,
      environment: process.env.DODO_PAYMENTS_TEST_MODE
        ? "test_mode"
        : "live_mode",
    })
  : undefined;
