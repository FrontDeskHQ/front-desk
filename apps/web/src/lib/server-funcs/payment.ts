import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { fetchClient } from "../live-state";
import { dodopayments } from "../payments";
import { getAuthUser } from "./get-auth-user";

type OrganizationUserWithBilling = Awaited<
  ReturnType<(typeof fetchClient.query.organizationUser)["forUser"]>
>[number];

const getOrganizationSubscription = (
  organizationUser: OrganizationUserWithBilling
) => organizationUser.organization?.subscriptions?.[0];

const authorizeOrganizationUser = async (customerId: string) => {
  const sessionData = await getAuthUser();

  if (!sessionData) {
    throw new Error("UNAUTHORIZED");
  }

  const organizationUser = (
    await fetchClient.query.organizationUser.forUser({
      enabledOnly: true,
      withSubscriptions: true,
    })
  ).find((v) => getOrganizationSubscription(v)?.customerId === customerId);

  if (!organizationUser || organizationUser.role !== "owner") {
    throw new Error("FORBIDDEN");
  }

  return organizationUser;
};

export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      customerId: z.string(),
      plan: z.enum(["starter", "pro"]),
      seats: z.number(),
    })
  )
  .handler(async ({ data: { customerId, plan, seats } }) => {
    if (!dodopayments) {
      throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
    }

    await authorizeOrganizationUser(customerId);

    const session = await dodopayments.checkoutSessions.create({
      customer: { customer_id: customerId },
      product_cart: [
        {
          product_id:
            plan === "starter"
              ? (process.env.DODO_PAYMENTS_STARTER_PRODUCT_ID as string)
              : (process.env.DODO_PAYMENTS_PRO_PRODUCT_ID as string),
          quantity: seats,
        },
      ],
      return_url: `${process.env.VITE_BASE_URL}/app/settings/organization/billing`,
    });

    return session;
  });

export const createCustomerPortalSession = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      customerId: z.string(),
    })
  )
  .handler(async ({ data: { customerId } }) => {
    if (!dodopayments) {
      throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
    }

    await authorizeOrganizationUser(customerId);

    const session =
      await dodopayments.customers.customerPortal.create(customerId);

    return session;
  });

export const getPastInvoices = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      customerId: z.string(),
    })
  )
  .handler(async ({ data: { customerId } }) => {
    if (!dodopayments) {
      throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
    }

    await authorizeOrganizationUser(customerId);

    const invoices = await dodopayments.payments.list({
      customer_id: customerId,
      page_size: 10,
    });

    return invoices?.items ?? [];
  });

export const cancelSubscription = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      customerId: z.string(),
    })
  )
  .handler(async ({ data: { customerId } }) => {
    if (!dodopayments) {
      throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
    }

    const organizationUser = await authorizeOrganizationUser(customerId);

    const subscriptionId =
      getOrganizationSubscription(organizationUser)?.subscriptionId;
    if (!subscriptionId) {
      throw new Error("SUBSCRIPTION_NOT_FOUND");
    }

    await dodopayments.subscriptions.update(subscriptionId, {
      cancel_at_next_billing_date: true,
      status: "cancelled",
    });

    return {
      success: true,
    };
  });

export const updateSubscription = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      customerId: z.string(),
      plan: z.enum(["starter", "pro"]).optional(),
      seats: z.number(),
    })
  )
  .handler(async ({ data: { customerId, plan, seats } }) => {
    if (!dodopayments) {
      throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
    }

    const organizationUser = await authorizeOrganizationUser(customerId);

    const subscription = getOrganizationSubscription(organizationUser);
    const subscriptionId = subscription?.subscriptionId;
    if (!subscriptionId) {
      throw new Error("SUBSCRIPTION_NOT_FOUND");
    }

    const newPlan = plan ?? subscription?.plan;

    await dodopayments.subscriptions
      .changePlan(subscriptionId, {
        product_id:
          newPlan === "starter"
            ? (process.env.DODO_PAYMENTS_STARTER_PRODUCT_ID as string)
            : (process.env.DODO_PAYMENTS_PRO_PRODUCT_ID as string),
        proration_billing_mode: "prorated_immediately",
        quantity: seats,
      })
      .then((res) => {
        console.log(res);
      });

    return {
      success: true,
    };
  });
