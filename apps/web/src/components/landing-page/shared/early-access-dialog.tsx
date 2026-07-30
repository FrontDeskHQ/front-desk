/**
 * Early-access request dialog.
 *
 * Three qualifying questions behind the company email — where support lives,
 * how much of it there is, and how much autonomy they'd hand the Agent. Enough
 * to tell whether someone matches the early-user profile without turning the
 * CTA into a form people abandon.
 */

import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group";
import {
  AUTONOMY_APPETITE_OPTIONS,
  CONVERSATION_VOLUME_OPTIONS,
  SUPPORT_CHANNEL_OPTIONS,
} from "@workspace/schemas/early-access";
import type {
  AutonomyAppetite,
  ConversationVolume,
  SupportChannel,
} from "@workspace/schemas/early-access";
import { CheckIcon } from "lucide-react";
import { useId, useState } from "react";

import { fetchClient } from "~/lib/live-state";

/** Personal inboxes tell us nothing about the team — ask for the work one. */
const PERSONAL_EMAIL_DOMAINS = new Set([
  "aol.com",
  "gmail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "me.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: string) {
  const email = value.trim().toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    return "Enter a valid email address.";
  }
  if (PERSONAL_EMAIL_DOMAINS.has(email.split("@")[1] ?? "")) {
    return "Please use your company email.";
  }
  return null;
}

interface EarlyAccessDialogProps {
  trigger: React.ReactElement;
}

export function EarlyAccessDialog({ trigger }: EarlyAccessDialogProps) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [channels, setChannels] = useState<SupportChannel[]>([]);
  const [volume, setVolume] = useState<ConversationVolume | null>(null);
  const [autonomy, setAutonomy] = useState<AutonomyAppetite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const resetForm = () => {
    setEmail("");
    setChannels([]);
    setVolume(null);
    setAutonomy(null);
    setError(null);
    setIsSubmitting(false);
    setSubmitted(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }
    setOpen(nextOpen);
  };

  const toggleChannel = (channel: SupportChannel, checked: boolean) => {
    setChannels((current) =>
      checked
        ? [...current, channel]
        : current.filter((value) => value !== channel)
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    if (channels.length === 0) {
      setError("Pick at least one place your support happens.");
      return;
    }
    if (!volume) {
      setError("Let us know roughly how many conversations you get.");
      return;
    }
    if (!autonomy) {
      setError("Let us know how much you'd let the Agent handle.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await fetchClient.mutate.earlyAccessRequest.submit({
        autonomy,
        channels,
        email: email.trim().toLowerCase(),
        volume,
      });
      setSubmitted(true);
    } catch (submitError) {
      console.error("Failed to submit early access request:", submitError);
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        {submitted ? (
          <>
            <DialogHeader className="items-center text-center gap-3 py-6">
              <div className="flex size-10 items-center justify-center rounded-full border">
                <CheckIcon className="size-5" />
              </div>
              <DialogTitle>You're on the list.</DialogTitle>
              <DialogDescription>
                We're onboarding teams a few at a time. If you're a fit, we'll
                email you from hello@tryfrontdesk.app.
              </DialogDescription>
            </DialogHeader>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          </>
        ) : (
          <form className="grid gap-6" onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Request early access</DialogTitle>
              <DialogDescription>
                Three questions so we know if FrontDesk is right for you today.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <Label htmlFor={`${fieldId}-email`}>Company email</Label>
              <Input
                autoFocus
                id={`${fieldId}-email`}
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <fieldset className="grid gap-3">
              <legend className="text-sm font-medium">
                Where does your support happen today?
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {SUPPORT_CHANNEL_OPTIONS.map((option) => (
                  <div className="flex items-center gap-2" key={option.value}>
                    <Checkbox
                      id={`${fieldId}-channel-${option.value}`}
                      checked={channels.includes(option.value)}
                      onCheckedChange={(checked) =>
                        toggleChannel(option.value, checked === true)
                      }
                    />
                    <Label
                      className="font-normal"
                      htmlFor={`${fieldId}-channel-${option.value}`}
                    >
                      {option.label}
                    </Label>
                  </div>
                ))}
              </div>
            </fieldset>

            <fieldset className="grid gap-3">
              <legend className="text-sm font-medium">
                How many support conversations do you get in a week?
              </legend>
              <RadioGroup
                className="grid gap-3 sm:grid-cols-2"
                value={volume ?? ""}
                onValueChange={(value) =>
                  setVolume(value as ConversationVolume)
                }
              >
                {CONVERSATION_VOLUME_OPTIONS.map((option) => (
                  <div className="flex items-center gap-2" key={option.value}>
                    <RadioGroupItem
                      id={`${fieldId}-volume-${option.value}`}
                      value={option.value}
                    />
                    <Label
                      className="font-normal"
                      htmlFor={`${fieldId}-volume-${option.value}`}
                    >
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>

            <fieldset className="grid gap-3">
              <legend className="text-sm font-medium">
                How much would you let the Agent handle on its own?
              </legend>
              <RadioGroup
                value={autonomy ?? ""}
                onValueChange={(value) =>
                  setAutonomy(value as AutonomyAppetite)
                }
              >
                {AUTONOMY_APPETITE_OPTIONS.map((option) => (
                  <div className="flex items-center gap-2" key={option.value}>
                    <RadioGroupItem
                      id={`${fieldId}-autonomy-${option.value}`}
                      value={option.value}
                    />
                    <Label
                      className="font-normal"
                      htmlFor={`${fieldId}-autonomy-${option.value}`}
                    >
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>

            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}

            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? "Sending…" : "Request early access"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
