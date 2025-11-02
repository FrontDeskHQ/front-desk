import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import z from "zod";
import { authClient } from "../auth-client";
import { fetchClient } from "../live-state";
import { dodopayments } from "../payments";

const authorizeOrganizationUser = async (customerId: string) => {
  const res = await authClient.getSession({
    fetchOptions: {
      headers: Object.fromEntries(getRequestHeaders()) as HeadersInit,
    },
  });

  if (!res.data) {
    throw new Error("UNAUTHORIZED");
  }

  const { user } = res.data;

  const organizationUser = (
    await fetchClient.query.organizationUser
      .where({
        userId: user.id,
        enabled: true,
      })
      .include({
        organization: {
          subscriptions: true,
        },
      })
      .get()
  ).find(
    (v) =>
      (v as any).organization?.subscriptions?.[0]?.customerId === customerId
  );

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
          quantity: 1,
          addons: [
            {
              addon_id:
                plan === "starter"
                  ? (process.env.DODO_PAYMENTS_STARTER_SEATS_ADDON_ID as string)
                  : (process.env.DODO_PAYMENTS_PRO_SEATS_ADDON_ID as string),
              quantity: seats,
            },
          ],
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

    const session = await dodopayments.customers.customerPortal.create(
      customerId
    );

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

    await dodopayments.subscriptions.update(
      (organizationUser as any).organization?.subscriptions?.[0]
        ?.subscriptionId as string,
      {
        cancel_at_next_billing_date: true,
        status: "cancelled",
      }
    );

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

    const subscriptionId = (organizationUser as any).organization
      ?.subscriptions?.[0]?.subscriptionId;

    const newPlan =
      plan ?? (organizationUser as any).organization?.subscriptions?.[0]?.plan;

    await dodopayments.subscriptions
      .changePlan(subscriptionId, {
        product_id:
          newPlan === "starter"
            ? (process.env.DODO_PAYMENTS_STARTER_PRODUCT_ID as string)
            : (process.env.DODO_PAYMENTS_PRO_PRODUCT_ID as string),
        quantity: 1,
        addons: [
          {
            addon_id:
              newPlan === "starter"
                ? (process.env.DODO_PAYMENTS_STARTER_SEATS_ADDON_ID as string)
                : (process.env.DODO_PAYMENTS_PRO_SEATS_ADDON_ID as string),
            quantity: seats,
          },
        ],
        proration_billing_mode: "prorated_immediately",
      })
      .then((res) => {
        console.log(res);
      });

    return {
      success: true,
    };
  });
