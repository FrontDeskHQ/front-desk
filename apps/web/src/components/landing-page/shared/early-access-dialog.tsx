/**
 * Early-access request dialog.
 *
 * Three qualifying questions behind the company email — where support lives,
 * how much of it there is, and how much autonomy they'd hand the Agent. Enough
 * to tell whether someone matches the early-user profile without turning the
 * CTA into a form people abandon.
 */

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
import { Button } from "@workspace/ui/components/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipRemove,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@workspace/ui/components/combobox";
import type { BaseItem } from "@workspace/ui/components/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { CheckIcon } from "lucide-react";
import { useRef, useState } from "react";

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

type ChannelItem = BaseItem<SupportChannel>;
type VolumeItem = BaseItem<ConversationVolume>;
type AutonomyItem = BaseItem<AutonomyAppetite>;

const CHANNEL_ITEMS: ChannelItem[] = SUPPORT_CHANNEL_OPTIONS;
const VOLUME_ITEMS: VolumeItem[] = CONVERSATION_VOLUME_OPTIONS;
const AUTONOMY_ITEMS: AutonomyItem[] = AUTONOMY_APPETITE_OPTIONS;

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
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [volume, setVolume] = useState<VolumeItem | null>(null);
  const [autonomy, setAutonomy] = useState<AutonomyItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Identifies the submission the open dialog is waiting on. Closing mid-flight
  // bumps it, so a response that lands afterwards can't flip the reopened form
  // into its confirmation state.
  const submissionIdRef = useRef(0);

  const resetForm = () => {
    submissionIdRef.current += 1;
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

  /** Stale validation text must not linger while the user fixes the field. */
  const clearError = () => setError(null);

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

    const submissionId = submissionIdRef.current;
    setIsSubmitting(true);
    setError(null);

    try {
      await fetchClient.mutate.earlyAccessRequest.submit({
        autonomy: autonomy.value,
        channels: channels.map((channel) => channel.value),
        email: email.trim().toLowerCase(),
        volume: volume.value,
      });
      if (submissionIdRef.current !== submissionId) {
        return;
      }
      setSubmitted(true);
    } catch (submitError) {
      console.error("Failed to submit early access request:", submitError);
      if (submissionIdRef.current !== submissionId) {
        return;
      }
      setError("Something went wrong. Please try again.");
    } finally {
      if (submissionIdRef.current === submissionId) {
        setIsSubmitting(false);
      }
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
                We're onboarding teams a few at a time.
                <br />
                We will get in touch with you soon. <br />
                You can talk to the founder at{" "}
                <a href="mailto:pedro@tryfrontdesk.app">
                  pedro@tryfrontdesk.app
                </a>
                .
              </DialogDescription>
            </DialogHeader>
            <Button
              variant="outline"
              size="lg"
              onClick={() => handleOpenChange(false)}
            >
              Close
            </Button>
          </>
        ) : (
          <form className="grid gap-6" onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Request early access</DialogTitle>
              <DialogDescription>
                Three questions so we get to know you better.
              </DialogDescription>
            </DialogHeader>

            <Input
              autoFocus
              type="email"
              aria-label="Company email"
              placeholder="Company email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                clearError();
              }}
            />

            <Combobox<ChannelItem, true>
              multiple
              items={CHANNEL_ITEMS}
              value={channels}
              onValueChange={(value) => {
                setChannels(value);
                clearError();
              }}
              itemToStringLabel={(item) =>
                Array.isArray(item)
                  ? item.map((entry) => entry.label).join(", ")
                  : (item?.label ?? "")
              }
              itemToStringValue={(item) => item.value}
              isItemEqualToValue={(a, b) => a.value === b.value}
            >
              <ComboboxTrigger
                aria-label="Where does your support happen today?"
                className="h-auto min-h-9 items-center py-1"
              >
                <ComboboxChips className="gap-1">
                  <ComboboxValue>
                    {(value: ChannelItem[]) => {
                      if (!value || value.length === 0) {
                        return (
                          <span className="text-muted-foreground">
                            Where does your support happen today?
                          </span>
                        );
                      }

                      return value.map((item) => (
                        <ComboboxChip key={item.value} aria-label={item.label}>
                          {item.label}
                          <ComboboxChipRemove
                            aria-label={`Remove ${item.label}`}
                          />
                        </ComboboxChip>
                      ));
                    }}
                  </ComboboxValue>
                </ComboboxChips>
              </ComboboxTrigger>
              <ComboboxContent className="w-(--anchor-width) max-w-(--anchor-width)">
                <ComboboxInput placeholder="Search…" />
                <ComboboxEmpty>No channels found.</ComboboxEmpty>
                <ComboboxList>
                  {(item: ChannelItem) => (
                    <ComboboxItem key={item.value} value={item}>
                      {item.label}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>

            <Combobox<VolumeItem, false>
              items={VOLUME_ITEMS}
              value={volume ?? undefined}
              onValueChange={(value) => {
                setVolume(value ?? null);
                clearError();
              }}
              itemToStringLabel={(item) => item?.label ?? ""}
              itemToStringValue={(item) => item.value}
              isItemEqualToValue={(a, b) => a.value === b.value}
            >
              <ComboboxTrigger
                aria-label="How many support conversations do you get in a week?"
                className="h-auto min-h-9 py-1.5"
              >
                {volume ? (
                  volume.label
                ) : (
                  <span className="text-muted-foreground text-left">
                    How many support conversations do you get in a week?
                  </span>
                )}
              </ComboboxTrigger>
              <ComboboxContent className="w-(--anchor-width) max-w-(--anchor-width)">
                <ComboboxInput placeholder="Search…" />
                <ComboboxEmpty>No options found.</ComboboxEmpty>
                <ComboboxList>
                  {(item: VolumeItem) => (
                    <ComboboxItem key={item.value} value={item}>
                      {item.label}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>

            <Combobox<AutonomyItem, false>
              items={AUTONOMY_ITEMS}
              value={autonomy ?? undefined}
              onValueChange={(value) => {
                setAutonomy(value ?? null);
                clearError();
              }}
              itemToStringLabel={(item) => item?.label ?? ""}
              itemToStringValue={(item) => item.value}
              isItemEqualToValue={(a, b) => a.value === b.value}
            >
              <ComboboxTrigger
                aria-label="How much would you let the Agent handle on its own?"
                className="h-auto min-h-9 py-1.5"
              >
                {autonomy ? (
                  autonomy.label
                ) : (
                  <span className="text-muted-foreground text-left">
                    How much would you let the Agent handle on its own?
                  </span>
                )}
              </ComboboxTrigger>
              <ComboboxContent className="w-(--anchor-width) max-w-(--anchor-width)">
                <ComboboxInput placeholder="Search…" />
                <ComboboxEmpty>No options found.</ComboboxEmpty>
                <ComboboxList>
                  {(item: AutonomyItem) => (
                    <ComboboxItem key={item.value} value={item}>
                      {item.label}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>

            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Sending…" : "Request early access"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
