import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import {
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import { Logo } from "@workspace/ui/components/logo";
import { Spinner } from "@workspace/ui/components/spinner";
import { useState } from "react";
import { z } from "zod";
import { useLogout } from "~/lib/hooks/auth";
import { mutate } from "~/lib/live-state";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/app/onboarding/new")({
  component: RouteComponent,
  head: () => {
    return {
      meta: [
        ...seo({
          title: "Create Organization - FrontDesk",
          description: "Create a new organization",
        }),
      ],
    };
  },
});

// TODO: Unify reserved slugs list - extract to shared constant
const reservedSlugs = [
  "support",
  "help",
  "status",
  "api",
  "admin",
  "www",
  "app",
  "dashboard",
  "login",
  "signup",
  "register",
  "account",
  "settings",
  "billing",
  "docs",
  "documentation",
  "blog",
  "about",
  "contact",
  "privacy",
  "terms",
  "legal",
];

const onboardingFormSchema = z.object({
  organizationName: z
    .string()
    .min(3, "Organization name must be at least 3 characters"),
  organizationSlug: z
    .string()
    .min(4, "Slug must be at least 4 characters")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers, and hyphens",
    )
    .refine((slug) => !reservedSlugs.includes(slug.toLowerCase()), {
      message: "This slug is reserved and cannot be used",
    }),
  teamMembers: z.string().optional(),
});

function OnboardingForm() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const logout = useLogout();
  // Function to convert organization name to slug format
  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "") // Remove non-alphanumeric characters except spaces and hyphens
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/-+/g, "-") // Replace multiple hyphens with a single hyphen
      .trim(); // Remove leading and trailing spaces/hyphens
  };

  // Keep track of the last generated slug to avoid overwriting manual edits
  const [lastGeneratedSlug, setLastGeneratedSlug] = useState<string>("");

  const { Field, handleSubmit, setFieldValue, getFieldValue, validateField } =
    useForm({
      defaultValues: {
        organizationName: "",
        organizationSlug: "",
        teamMembers: "",
      } as z.infer<typeof onboardingFormSchema>,
      validators: {
        onSubmit: onboardingFormSchema,
      },
      onSubmit: async ({ value }) => {
        try {
          setLoading(true);

          // TODO change this to a fetch call
          await mutate.organization.create({
            name: value.organizationName,
            slug: value.organizationSlug,
          });

          setLoading(false);
          navigate({ to: "/app" });
        } catch (err) {
          console.error("Error creating organization:", err);
          setLoading(false);
          setError(err instanceof Error ? err.message : "An error occurred");
        }
      },
    });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6 w-96 items-center">
      <div className="absolute left-4 top-4 flex items-center gap-2">
        <div className="size-fit p-2 border rounded-md bg-muted">
          <Logo>
            <Logo.Icon className="size-4" />
          </Logo>
        </div>
        <h1 className="text-xl">FrontDesk</h1>
      </div>
      <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
        <span className="text-sm text-muted-foreground">
          Logged in as: {user.email}
        </span>
        <Button variant="outline" size="sm" onClick={logout}>
          Logout
        </Button>
      </div>
      <h1 className="text-xl font-medium">Create new organization</h1>
      {error ? <p className="text-destructive">{error}</p> : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="flex flex-col gap-4 w-full"
      >
        <Field name="organizationName">
          {(field) => (
            <FormItem field={field}>
              <FormLabel>Organization Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="Acme Inc."
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    field.setValue(newValue);

                    // Generate the new slug
                    const newSlug = generateSlug(newValue);

                    // Get the current slug value
                    const currentSlug = getFieldValue(
                      "organizationSlug",
                    ) as string;

                    // Only update the slug if it's empty or matches the previously generated value
                    if (
                      currentSlug === "" ||
                      currentSlug === lastGeneratedSlug
                    ) {
                      setFieldValue("organizationSlug", newSlug);
                      setLastGeneratedSlug(newSlug);
                      validateField("organizationSlug", "change");
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        </Field>
        {/* TODO validate uniqueness */}
        <Field
          name="organizationSlug"
          validators={{
            onChangeListenTo: ["organizationName"],
          }}
        >
          {(field) => (
            <FormItem field={field}>
              <FormLabel>Organization Slug</FormLabel>
              <FormControl>
                <Input
                  placeholder="acme"
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) => field.setValue(e.target.value.toLowerCase())}
                />
              </FormControl>
              <FormMessage />
              <p className="text-xs text-muted-foreground">
                This will be your help center URL:{" "}
                {field.state.value || "your-org"}.tryfrontdesk.app
              </p>
            </FormItem>
          )}
        </Field>
        <Button type="submit" className="mt-6 w-full" disabled={loading}>
          {loading ? <Spinner /> : null} Create Organization
        </Button>
      </form>
    </div>
  );
}

function RouteComponent() {
  return (
    <div className="w-screen h-screen flex items-center justify-center bg-muted/20">
      <OnboardingForm />
    </div>
  );
}
