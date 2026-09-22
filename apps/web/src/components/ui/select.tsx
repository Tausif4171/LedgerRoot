"use client";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Children, isValidElement, useState, type ReactNode, type Ref } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

type Props = {
  id?: string;
  name?: string;
  value: string;
  onValueChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  ref?: Ref<HTMLButtonElement>;
  children: ReactNode;
};

// Encode every value so an explicitly selectable empty value remains distinct
// from Radix's empty-string placeholder. Domain values are never changed.
const encode = (value: string) => `value:${value}`;
export function Select({
  children,
  value,
  onValueChange,
  name,
  required,
  placeholder,
  ...trigger
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <SelectPrimitive.Root
      open={open}
      onOpenChange={setOpen}
      name={name}
      required={required}
      disabled={trigger.disabled}
      value={placeholder && value === "" ? "" : encode(value)}
      onValueChange={(next) => onValueChange(next.slice(6))}
    >
      <SelectPrimitive.Trigger {...trigger} className="select-trigger">
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown size={16} aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <section aria-label="Selection options" hidden={!open}>
          <SelectPrimitive.Content
            className="select-content"
            position="popper"
            sideOffset={6}
            collisionPadding={12}
          >
            <SelectPrimitive.ScrollUpButton className="select-scroll">
              <ChevronUp size={16} />
            </SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport>
              {Children.toArray(children).map((child) => {
                if (
                  !isValidElement<{ value: string; children: ReactNode; disabled?: boolean }>(child)
                )
                  return null;
                return (
                  <SelectPrimitive.Item
                    key={child.props.value}
                    value={encode(child.props.value)}
                    disabled={child.props.disabled}
                    className="select-item"
                  >
                    <SelectPrimitive.ItemText>{child.props.children}</SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator>
                      <Check size={16} aria-hidden="true" />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                );
              })}
            </SelectPrimitive.Viewport>
            <SelectPrimitive.ScrollDownButton className="select-scroll">
              <ChevronDown size={16} />
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </section>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
