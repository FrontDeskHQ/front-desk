"use client";

import type * as LabelPrimitive from "@radix-ui/react-label";
import { Slot } from "@radix-ui/react-slot";
import type { useField } from "@tanstack/react-form";
import { Label } from "@workspace/ui/components/label";
import { cn } from "@workspace/ui/lib/utils";
import * as React from "react";
import { use } from "react";

type FormItemContextValue = ReturnType<typeof useField>;

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
);

function FormItem<T>({
  className,
  field,
  ...props
}: React.ComponentProps<"div"> & {
  field: T;
}) {
  return (
    <FormItemContext.Provider value={field as FormItemContextValue}>
      <div
        data-slot="form-item"
        className={cn("grid gap-2", className)}
        {...props}
      />
    </FormItemContext.Provider>
  );
}

function FormLabel({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  const { name, state } = use(FormItemContext);

  return (
    <Label
      data-slot="form-label"
      data-error={!state.meta.isValid}
      className={cn("data-[error=true]:text-destructive", className)}
      htmlFor={name}
      {...props}
    />
  );
}

function FormControl({ ...props }: React.ComponentProps<typeof Slot>) {
  const { name, state } = use(FormItemContext);

  return (
    <Slot
      data-slot="form-control"
      id={`${name}-item`}
      aria-describedby={
        state.meta.isValid
          ? `${name}-description ${name}-message`
          : `${name}-description`
      }
      aria-invalid={!state.meta.isValid}
      {...props}
    />
  );
}

function FormDescription({ className, ...props }: React.ComponentProps<"p">) {
  const { name } = use(FormItemContext);

  return (
    <p
      data-slot="form-description"
      id={`${name}-description`}
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function FormMessage({ className, ...props }: React.ComponentProps<"p">) {
  const { name, state } = use(FormItemContext);
  const body = state.meta.isValid
    ? props.children
    : state.meta.errors
        ?.map((e) => (e as unknown as { message: string })?.message)
        .join(", ");

  if (!body) {
    return null;
  }

  return (
    <p
      data-slot="form-message"
      id={`${name}-message`}
      className={cn("text-destructive text-sm", className)}
      {...props}
    >
      {body}
    </p>
  );
}

export { FormControl, FormDescription, FormItem, FormLabel, FormMessage };
