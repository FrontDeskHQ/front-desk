import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { cn } from "@workspace/ui/lib/utils";
import * as React from "react";
import { useState } from "react";
import { Combobox, ComboboxTextInput } from "./combobox";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

function InputWithSeparator({
  className,
  placeholder,
  separatorKeys = ["Enter", " ", ","],
  value: externalValue,
  onValueChange,
  initialValue,
}: {
  className?: string;
  placeholder?: string;
  separatorKeys?: string[];
  value?: string[];
  onValueChange?: (value: string[]) => void;
  initialValue?: string[];
}) {
  const [value, setValue] = useControllableState<string[]>({
    defaultProp: initialValue ?? [],
    prop: externalValue,
    onChange: onValueChange,
  });
  const [inputValue, setInputValue] = useState<string>("");

  return (
    <Combobox
      value={value.map((v) => ({ value: v, label: v }))}
      onValueChange={(v) => setValue(v.map((v) => v.value))}
      multiple
    >
      <ComboboxTextInput
        className={className}
        placeholder={value.length > 0 ? undefined : placeholder}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (separatorKeys.includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            const trimmedInputValue = inputValue.trim();
            if (trimmedInputValue) {
              setValue([...value, trimmedInputValue]);
            }
            setInputValue("");
          }
        }}
        onBlur={() => {
          const trimmedInputValue = inputValue.trim();
          if (trimmedInputValue) {
            setValue([...value, trimmedInputValue]);
          }
          setInputValue("");
        }}
      />
    </Combobox>
  );
}

interface SearchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onSearchChange?: (value: string) => void;
}

const Search = React.forwardRef<HTMLInputElement, SearchProps>(
  (
    { className, placeholder = "Search threads...", onSearchChange, ...props },
    ref,
  ) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onSearchChange?.(e.target.value);
      props.onChange?.(e);
    };

    return (
      <Input
        ref={ref}
        type="search"
        placeholder={placeholder}
        className={`w-full border-neutral-800 text-neutral-50 placeholder:text-neutral-400 ${className || ""}`}
        onChange={handleChange}
        {...props}
      />
    );
  },
);

Search.displayName = "Search";

export { Input, InputWithSeparator, Search };
