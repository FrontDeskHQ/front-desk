import { useQuery } from "@tanstack/react-query";
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
  ComboboxValue,
  ComboboxTrigger,
} from "@workspace/ui/components/combobox";
import { Hash, Loader2, Lock } from "lucide-react";

export type ChannelOption = {
  id: string;
  name: string;
  meta?: { isPrivate?: boolean };
};

type BaseProps = {
  queryKey: readonly unknown[];
  fetchChannels: () => Promise<ChannelOption[]>;
  disabled?: boolean;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
};

type SingleProps = BaseProps & {
  mode: "single";
  value: ChannelOption | null;
  onChange: (value: ChannelOption | null) => void;
};

type MultiProps = BaseProps & {
  mode: "multi";
  value: ChannelOption[];
  onChange: (value: ChannelOption[]) => void;
};

type Props = SingleProps | MultiProps;

type Item = {
  value: string;
  label: string;
  channel: ChannelOption;
};

const dedupeById = <T,>(list: T[], getId: (item: T) => string): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of list) {
    const id = getId(item);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(item);
  }
  return result;
};

const ChannelLabel = ({ channel }: { channel: ChannelOption }) => (
  <span className="flex items-center gap-1.5">
    {channel.meta?.isPrivate ? (
      <Lock className="size-3.5" />
    ) : (
      <Hash className="size-3.5" />
    )}
    {channel.name}
  </span>
);

export function ChannelPicker(props: Props) {
  const {
    queryKey,
    fetchChannels,
    disabled,
    placeholder = "Select a channel",
    emptyLabel = "No channels found",
    className,
  } = props;

  const {
    data: channels,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: fetchChannels,
    staleTime: 5 * 60 * 1000,
  });

  const items: Item[] = dedupeById(channels ?? [], (c) => c.id).map((c) => ({
    value: c.id,
    label: c.name,
    channel: c,
  }));

  if (props.mode === "single") {
    const selectedItem = props.value
      ? { value: props.value.id, label: props.value.name, channel: props.value }
      : null;

    const itemsWithSelected =
      selectedItem && !items.some((i) => i.value === selectedItem.value)
        ? [selectedItem, ...items]
        : items;

    return (
      <Combobox<Item, false>
        items={itemsWithSelected}
        value={selectedItem ?? undefined}
        onValueChange={(value) => {
          props.onChange(value ? value.channel : null);
        }}
        disabled={disabled}
        itemToStringLabel={(item) => item.label}
        itemToStringValue={(item) => item.value}
        isItemEqualToValue={(a, b) => a.value === b.value}
      >
        <ComboboxTrigger className={className}>
          {selectedItem ? (
            <ChannelLabel channel={selectedItem.channel} />
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxInput placeholder="Search channels..." />
          <ComboboxEmpty>
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" /> Loading…
              </span>
            ) : isError ? (
              <button
                type="button"
                className="underline"
                onClick={() => refetch()}
              >
                Failed to load, retry
              </button>
            ) : (
              emptyLabel
            )}
          </ComboboxEmpty>
          <ComboboxList>
            {(item: Item) => (
              <ComboboxItem key={item.value} value={item}>
                <ChannelLabel channel={item.channel} />
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    );
  }

  const selectedItems: Item[] = props.value.map((c) => ({
    value: c.id,
    label: c.name,
    channel: c,
  }));

  const itemsWithSelected = dedupeById(
    [
      ...selectedItems.filter((s) => !items.some((i) => i.value === s.value)),
      ...items,
    ],
    (i) => i.value,
  );

  const formatItemsLabel = (item: Item | Item[] | null) => {
    if (item == null) {
      return "";
    }
    if (Array.isArray(item)) {
      return item.map((i) => i.label).join(", ");
    }
    return item.label;
  };

  return (
    <Combobox<Item, true>
      multiple
      items={itemsWithSelected}
      value={selectedItems}
      onValueChange={(value) => {
        props.onChange(value.map((v) => v.channel));
      }}
      disabled={disabled}
      itemToStringLabel={formatItemsLabel}
      itemToStringValue={(item) => item.value}
      isItemEqualToValue={(a, b) => a.value === b.value}
    >
      <ComboboxTrigger
        className={["h-auto min-h-9 items-center py-1", className]
          .filter(Boolean)
          .join(" ")}
      >
        <ComboboxChips className="gap-1">
          <ComboboxValue>
            {(value: Item[]) => {
              if (!value || value.length === 0) {
                return <span className="text-muted-foreground">{placeholder}</span>;
              }

              return value.map((item) => (
                <ComboboxChip key={item.value} aria-label={item.label}>
                  <ChannelLabel channel={item.channel} />
                  <ComboboxChipRemove aria-label={`Remove ${item.label}`} />
                </ComboboxChip>
              ));
            }}
          </ComboboxValue>
        </ComboboxChips>
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput placeholder="Search channels..." />
        <ComboboxEmpty>
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin" /> Loading…
            </span>
          ) : isError ? (
            <button
              type="button"
              className="underline"
              onClick={() => refetch()}
            >
              Failed to load, retry
            </button>
          ) : (
            emptyLabel
          )}
        </ComboboxEmpty>
        <ComboboxList>
          {(item: Item) => (
            <ComboboxItem key={item.value} value={item}>
              <ChannelLabel channel={item.channel} />
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
