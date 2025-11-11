interface PricingPlan {
  name: string;
  price: string;
  description: string;
  features: string[];
  highlight?: boolean;
}

interface PricingProps {
  plans?: PricingPlan[];
}

const defaultPlans: PricingPlan[] = [
  {
    name: "Starter",
    price: "$9",
    description: "Perfect for small teams getting started with FrontDesk.",
    features: [
      "Unlimited support tickets",
      "Unlimited customers",
      "Public support portal",
      "2 support channels",
    ],
  },
  {
    name: "Pro",
    price: "$24",
    description: "Everything in Starter, plus:",
    features: [
      "Unlimited team members",
      "Unlimited support channels",
      "Custom domain for your support portal",
      "Priority support",
    ],
    highlight: true,
  },
];

const CheckIcon = () => (
  <svg
    className="h-4 w-4 shrink-0 text-primary"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <title>Check icon</title>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

export function Pricing({ plans = defaultPlans }: PricingProps) {
  return (
    <div className="my-8 grid gap-6 md:grid-cols-2">
      {plans.map((plan) => (
        <div
          key={plan.name}
          className={`relative rounded-lg border p-6 ${
            plan.highlight
              ? "border-primary bg-muted/50"
              : "border-border bg-background"
          }`}
        >
          <div className="mb-4">
            <h3 className="text-xl font-semibold">{plan.name}</h3>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-primary">
                {plan.price}
              </span>
              <span className="text-sm text-muted-foreground">per seat/mo</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {plan.description}
            </p>
          </div>
          <ul className="space-y-2">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <CheckIcon />
                <span className="text-sm">{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
