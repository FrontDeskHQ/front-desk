"use client";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { ListFilter, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Button } from "../button";
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Submenu,
  SubmenuContent,
  SubmenuTrigger,
} from "../menu";

// Type definitions for filter configuration
export interface FilterOption {
  label: string;
  value: string | number;
  count?: number;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export interface FilterGroup {
  label: string;
  key: string;
  options: FilterOption[];
  icon?: React.ReactNode;
}

export type FilterOptions = Record<string, FilterGroup>;

export type FilterValue = Record<string, (string | number)[]>;

export interface FilterProps {
  options: FilterOptions;
  value?: FilterValue;
  onValueChange?: (value: FilterValue) => void;
  initialValue?: FilterValue;
}

const omitFilterGroup = (value: FilterValue, groupKey: string): FilterValue =>
  Object.fromEntries(Object.entries(value).filter(([key]) => key !== groupKey));

const SubMenuOptions = ({
  group,
  value,
  setValue,
  groupKey,
}: {
  group: FilterGroup;
  value: FilterValue;
  setValue: (value: FilterValue) => void;
  groupKey: string;
}) => {
  const toggleValue = (
    currentValue: FilterValue,
    checked: boolean,
    selectedOption: FilterOption
  ) => {
    const newGroupValue = checked
      ? [...(currentValue[groupKey] ?? []), selectedOption.value]
      : (currentValue[groupKey] ?? []).filter(
          (entry) => entry !== selectedOption.value
        );

    const newValue = newGroupValue.length
      ? {
          ...currentValue,
          [groupKey]: newGroupValue,
        }
      : omitFilterGroup(currentValue, groupKey);

    setValue(newValue);
  };

  return (
    <MenuGroup>
      {group.options.map((menuOption) => {
        const hasIcons = group.options.some((entry) => entry.icon);

        return (
          <MenuCheckboxItem
            key={menuOption.value}
            checked={value[groupKey]?.includes(menuOption.value) ?? false}
            onCheckedChange={(checked) => {
              toggleValue(value, checked, menuOption);
            }}
          >
            {hasIcons && (menuOption.icon ?? <div className="size-4" />)}
            {menuOption.label}
          </MenuCheckboxItem>
        );
      })}
      {value[groupKey]?.length && (
        <>
          <MenuSeparator />
          <MenuItem
            onClick={() => {
              setValue(omitFilterGroup(value, groupKey));
            }}
          >
            Clear selection
          </MenuItem>
        </>
      )}
    </MenuGroup>
  );
};

const Filter = ({
  options,
  value: externalValue,
  onValueChange,
  initialValue,
}: FilterProps) => {
  const [value, setValue] = useControllableState<FilterValue>({
    defaultProp: initialValue ?? {},
    onChange: onValueChange,
    prop: externalValue,
  });

  const hasValue = Object.values(value).some((values) => values.length > 0);

  return (
    <div className="flex items-center gap-2">
      <AnimatePresence mode="popLayout">
        {Object.entries(value).map(([key, values]) => {
          const group = options[key];

          if (!group || values.length === 0) {
            return null;
          }

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.05, ease: "easeOut" }}
              className="border rounded-sm flex text-xs h-6 items-center bg-muted/65 overflow-hidden"
            >
              <div className="px-1.5 py-0.5 border-r h-full flex items-center gap-1">
                {group.icon}
                {group.label}
              </div>
              <div className="px-1.5 py-0.5 border-r h-full flex items-center">
                {values.length > 1 ? "in" : "is"}
              </div>
              <Menu>
                <MenuTrigger>
                  <Button
                    variant="ghost"
                    className="px-1.5 py-0.5 flex gap-2 items-center h-full border-r rounded-none hover:bg-muted-foreground/8 dark:hover:bg-muted-foreground/8"
                  >
                    {values.length > 2 ? (
                      <>
                        <div className="flex items-center gap-1">
                          {
                            group.options.find(
                              (option) => option.value === values[0]
                            )?.icon
                          }
                          {
                            group.options.find(
                              (option) => option.value === values[0]
                            )?.label
                          }
                        </div>
                        <div>+{values.length - 1}</div>
                      </>
                    ) : (
                      values.map((selectedValue) => {
                        const selectedOption = group.options.find(
                          (entry) => entry.value === selectedValue
                        );

                        return (
                          <div
                            key={selectedValue}
                            className="flex items-center gap-1"
                          >
                            {selectedOption?.icon ?? <div className="size-4" />}
                            {selectedOption?.label}
                          </div>
                        );
                      })
                    )}
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  <SubMenuOptions
                    group={group}
                    value={value}
                    setValue={setValue}
                    groupKey={key}
                  />
                </MenuContent>
              </Menu>
              <Button
                variant="ghost"
                className="p-0 size-5 has-[>svg]:p-0 rounded-none hover:bg-muted-foreground/8 dark:hover:bg-muted-foreground/8"
                onClick={() => {
                  setValue(omitFilterGroup(value, key));
                }}
              >
                <X className="size-4" />
              </Button>
            </motion.div>
          );
        })}

        <motion.div
          transition={{ duration: 0.05, ease: "easeOut" }}
          key="menu"
          layout
        >
          <Menu>
            <MenuTrigger>
              <Button variant="ghost" size="sm" key="button">
                <ListFilter className="size-4" />
                <AnimatePresence mode="wait" initial={false}>
                  {!hasValue && (
                    <motion.span
                      key="add-text"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{
                        duration: 0.05,
                        ease: "easeOut",
                      }}
                      className="overflow-hidden whitespace-nowrap"
                    >
                      Filter
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuGroup>
                {Object.entries(options).map(([key, group]) => (
                  <Submenu key={key}>
                    <SubmenuTrigger>
                      {group.icon ?? <div className="size-4" />}
                      {group.label}
                    </SubmenuTrigger>
                    <SubmenuContent>
                      <SubMenuOptions
                        group={group}
                        value={value}
                        setValue={setValue}
                        key={key}
                        groupKey={key}
                      />
                    </SubmenuContent>
                  </Submenu>
                ))}
              </MenuGroup>
            </MenuContent>
          </Menu>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

Filter.displayName = "Filter";

export { Filter };
