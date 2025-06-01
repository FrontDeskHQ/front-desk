import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import {
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import { Icon } from "@workspace/ui/components/logo";
import { Spinner } from "@workspace/ui/components/spinner";
import { useState } from "react";
import { z } from "zod";

export const Route = createFileRoute("/onboarding")({
  component: RouteComponent,
});

const onboardingFormSchema = z.object({
  organizationName: z
    .string()
    .min(3, "Organization name must be at least 3 characters"),
  organizationSlug: z
    .string()
    .min(3, "Slug must be at least 3 characters")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers, and hyphens"
    ),
  teamMembers: z.string().optional(),
});

function OnboardingForm() {
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
        // Here you would handle the submission to create the organization
        // and invite team members
        try {
          // TODO: Implement API call to create organization and invite members
          setLoading(true);
          console.log("Form submitted with values:", value);
          // await createOrganization(value);
          setLoading(false);
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
      <div className="size-fit p-4 border rounded-2xl bg-muted">
        <Icon className="size-12" />
      </div>
      <h1 className="text-xl font-medium">Create Your Organization</h1>
      {error ? <p className="text-destructive">{error}</p> : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="flex flex-col gap-4 w-full"
      >
        <Field
          name="organizationName"
          children={(field) => (
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
                      "organizationSlug"
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
        />
        {/* TODO validate uniqueness */}
        <Field
          name="organizationSlug"
          validators={{
            onChangeListenTo: ["organizationName"],
          }}
          children={(field) => (
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
        />
        {/* <Field
          name="teamMembers"
          children={(field) => (
            <FormItem field={field}>
              <FormLabel>Invite Team Members (Optional)</FormLabel>
              <FormControl>
                <Input
                  placeholder="email1@example.com, email2@example.com"
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) => field.setValue(e.target.value)}
                />
              </FormControl>
              <FormMessage />
              <p className="text-xs text-muted-foreground">
                Separate multiple email addresses with commas
              </p>
            </FormItem>
          )}
        /> */}
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
