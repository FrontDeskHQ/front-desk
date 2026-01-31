import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
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
import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import { z } from "zod";
import { authClient } from "~/lib/auth-client";

const signInFormSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const SignInForm = () => {
  const posthog = usePostHog();
  const oauthClick = () => {
    posthog?.capture("auth:oauth_button_click");
  };

  const { Field, handleSubmit } = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    validators: {
      onSubmit: signInFormSchema,
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
          callbackURL: "/app",
        },
        {
          onRequest: () => {
            setLoading(true);
          },
          onSuccess: () => {
            setLoading(false);
          },
          onError: (ctx) => {
            setLoading(false);
            setError(ctx.error.message);
          },
        },
      );
    },
  });

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex flex-col gap-6 w-xs items-center">
      <div className="size-fit p-4 border rounded-2xl bg-muted">
        <Logo>
          <Logo.Icon className="size-12" />
        </Logo>
      </div>
      <h1 className="text-xl font-medium">Log in to FrontDesk</h1>
      {error ? <p className="text-destructive">{error}</p> : null}
      {import.meta.env.VITE_ENABLE_GOOGLE_LOGIN === "true" ? (
        <Button
          type="button"
          className="mt-6 w-full"
          onClick={() => {
            oauthClick();
            authClient.signIn.social({
              provider: "google",
              callbackURL: `${window.location.origin}/app`,
            });
          }}
        >
          Continue with Google
        </Button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex flex-col gap-4 w-full"
        >
          <Field name="email">
            {(field) => (
              <FormItem field={field}>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    placeholder="you@example.com"
                    id={field.name}
                    value={field.state.value}
                    onChange={(e) => field.setValue(e.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          </Field>
          <Field name="password">
            {(field) => (
              <FormItem field={field}>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input
                    placeholder="********"
                    type="password"
                    id={field.name}
                    value={field.state.value}
                    onChange={(e) => field.setValue(e.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          </Field>
          <Button type="submit" className="mt-6 w-full" disabled={loading}>
            {loading ? <Spinner /> : null} Log in
          </Button>
        </form>
      )}
    </div>
  );
};

const signUpFormSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
    name: z.string().min(3),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const SignUpForm = () => {
  const navigate = useNavigate();

  const { Field, handleSubmit } = useForm({
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      name: "",
    },
    validators: {
      onSubmit: signUpFormSchema,
    },
    onSubmit: async ({ value }) => {
      await authClient.signUp.email(
        {
          email: value.email,
          name: value.name,
          password: value.password,
          callbackURL: "/app",
        },
        {
          onRequest: () => {
            setLoading(true);
          },
          onSuccess: () => {
            // Alternative solution to BetterAuth callbackURL property not working in this case
            navigate({
              to: "/app",
            });
            setLoading(false);
          },
          onError: (ctx) => {
            setLoading(false);
            setError(ctx.error.message);
          },
        },
      );
    },
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6 w-xs items-center">
      <div className="size-fit p-4 border rounded-2xl bg-muted">
        <Logo>
          <Logo.Icon className="size-12" />
        </Logo>
      </div>
      <h1 className="text-xl font-medium">Sign Up to FrontDesk</h1>
      {error ? <p className="text-destructive">{error}</p> : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="flex flex-col gap-4 w-full"
      >
        <Field name="name">
          {(field) => (
            <FormItem field={field}>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="John Doe"
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) => field.setValue(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        </Field>
        <Field name="email">
          {(field) => (
            <FormItem field={field}>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  placeholder="you@example.com"
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) => field.setValue(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        </Field>
        <Field name="password">
          {(field) => (
            <FormItem field={field}>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  placeholder="********"
                  type="password"
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) => field.setValue(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        </Field>
        <Field name="confirmPassword">
          {(field) => (
            <FormItem field={field}>
              <FormLabel>Confirm Password</FormLabel>
              <FormControl>
                <Input
                  placeholder="********"
                  type="password"
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) => field.setValue(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        </Field>
        <Button type="submit" className="mt-6 w-full" disabled={loading}>
          {loading ? <Spinner /> : null} Sign Up
        </Button>
      </form>
    </div>
  );
};

export const AuthButtonGroup = () => {
  const posthog = usePostHog();

  const loginClick = () => {
    posthog?.capture("auth:login_button_click");
  };

  const { data: session } = authClient.useSession();

  return (
    <div className="flex items-center gap-2">
      {session ? (
        <Button variant="primary" render={<Link to="/app" />}>
          Go to app
        </Button>
      ) : (
        <>
          <Button
            variant={
              import.meta.env.VITE_ENABLE_GOOGLE_LOGIN ? "primary" : "ghost"
            }
            render={<Link to="/sign-in" />}
            onClick={loginClick}
          >
            Log in
          </Button>
          {!import.meta.env.VITE_ENABLE_GOOGLE_LOGIN && (
            <Button variant="primary" render={<Link to="/sign-up" />}>
              Sign Up
            </Button>
          )}
        </>
      )}
    </div>
  );
};
