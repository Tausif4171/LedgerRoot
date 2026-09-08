import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";
const variants = cva("btn", {
  variants: {
    variant: { primary: "btn-primary", secondary: "", ghost: "btn-ghost", danger: "btn-danger" },
    size: { default: "", small: "btn-small" },
  },
  defaultVariants: { variant: "secondary", size: "default" },
});
export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants>) {
  return <button className={clsx(variants({ variant, size }), className)} {...props} />;
}
