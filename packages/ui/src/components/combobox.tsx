import {
  Combobox as ComboboxPrimitive,
  ComboboxRootProps,
} from "@base-ui-components/react/combobox";
import { cn } from "@workspace/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { CheckIcon, ChevronsUpDown, PlusIcon, XIcon } from "lucide-react";
import { useRef } from "react";
import { KeybindIsolation } from "./keybind";

export function Combobox<T, Multiple extends boolean | undefined = false>({
  ...props
}: ComboboxRootProps<T, Multiple>) {
  return <ComboboxPrimitive.Root autoHighlight {...props} />;
}

const triggerVariants = cva("", {
  variants: {
    variant: {
      default:
        "placeholder:text-muted-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm items-center justify-between hover:bg-accent dark:hover:bg-input/50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
      unstyled: "",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export const ComboboxTrigger = ({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Trigger> &
  VariantProps<typeof triggerVariants>) => {
  return (
    <ComboboxPrimitive.Trigger
      className={cn(triggerVariants({ variant }), className)}
      {...props}
    >
      <ComboboxPrimitive.Value />
      <ComboboxPrimitive.Icon className="flex">
        <ChevronsUpDown className="size-4" />
      </ComboboxPrimitive.Icon>
    </ComboboxPrimitive.Trigger>
  );
};

export const ComboboxContent = ({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Popup>) => {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner align="start" sideOffset={4}>
        <ComboboxPrimitive.Popup
          className={cn(
            "bg-popover text-popover-foreground flex flex-col h-full w-full overflow-hidden rounded-md origin-[var(--transform-origin)] max-w-[min(--spacing(100),var(--available-width))] max-h-[min(24rem,var(--available-height))] transition-[transform,scale,opacity] data-[ending-style]:scale-90 data-[ending-style]:opacity-0 data-[starting-style]:scale-90 data-[starting-style]:opacity-0 duration-100 border",
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
};

export const ComboboxInput = ({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Input>) => {
  return (
    <KeybindIsolation className="h-[var(--input-container-height)] text-center w-full">
      <ComboboxPrimitive.Input
        className={cn(
          "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input flex h-9 w-full min-w-0 rounded-md bg-transparent px-2 text-base transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        {...props}
      />
    </KeybindIsolation>
  );
};

export const ComboboxEmpty = ({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Empty>) => {
  return (
    <ComboboxPrimitive.Empty
      className="p-4 text-[0.925rem] leading-4 text-gray-600 empty:m-0 empty:p-0"
      {...props}
    />
  );
};

export const ComboboxList = ({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.List>) => {
  return <ComboboxPrimitive.List className={cn("", className)} {...props} />;
};

export const ComboboxItem = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Item>) => {
  return (
    <ComboboxPrimitive.Item
      className={cn(
        "flex cursor-default select-none items-center rounded-md px-3 py-1.5 text-sm outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 gap-2",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator className="col-start-1 ml-auto">
        <CheckIcon />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
};

export const ComboboxCreatableItem = ({
  className,
  children,
  creatable,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Item> & {
  creatable?: string;
}) => {
  return (
    <ComboboxPrimitive.Item
      className={cn(
        "flex cursor-default select-none items-center rounded-md px-3 py-1.5 text-sm outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 gap-2",
        className,
      )}
      {...props}
    >
      <PlusIcon className="size-4" />
      {children}
    </ComboboxPrimitive.Item>
  );
};

export type BaseItem<T = string> = {
  value: T;
  label: string;
  creatable?: string;
};

export const prepareCreatableItems = <T extends BaseItem>(
  items: T[],
  query: string,
  creatable?: boolean,
): T[] => {
  if (!creatable) {
    return items;
  }

  const trimmed = query.trim();
  if (trimmed === "") {
    return items;
  }

  const normalized = trimmed.toLocaleLowerCase();
  const exactExists = items.some(
    (item) => item.label.trim().toLocaleLowerCase() === normalized,
  );

  if (exactExists) {
    return items;
  }

  return [
    ...items,
    {
      value: `create:${normalized}` as T["value"],
      label: `Create "${trimmed}"`,
      creatable: trimmed,
    } as T,
  ];
};

export const ComboboxTextInput = ({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Input>) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  return (
    <ComboboxPrimitive.Chips
      className={cn(
        "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex flex-wrap items-center gap-0.5 h-auto min-h-9 w-full min-w-0 rounded-md border bg-transparent px-1.5 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className,
      )}
      ref={containerRef}
    >
      <ComboboxPrimitive.Value>
        {(value: BaseItem[]) => (
          <>
            {(value ?? []).map((item) => (
              <ComboboxPrimitive.Chip
                key={item.value}
                className="flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs outline-none cursor-default focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]"
                aria-label={item.label}
              >
                {item.label}
                <ComboboxPrimitive.ChipRemove
                  className="rounded-md p-1 text-inherit hover:bg-muted-foreground/10"
                  aria-label="Remove"
                >
                  <XIcon className="size-3.5" />
                </ComboboxPrimitive.ChipRemove>
              </ComboboxPrimitive.Chip>
            ))}
            <ComboboxPrimitive.Input
              {...props}
              className="min-w-12 flex-1 h-full border-0 bg-transparent pl-2 outline-none"
            />
          </>
        )}
      </ComboboxPrimitive.Value>
    </ComboboxPrimitive.Chips>
  );
};
