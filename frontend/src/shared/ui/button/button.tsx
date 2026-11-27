import { Button as MantineButton, createPolymorphicComponent, type ButtonProps } from "@mantine/core";
import { forwardRef } from "react";

/** The shared Button: a loading button is disabled (no double submit) and announces itself as busy. */
export const Button = createPolymorphicComponent<"button", ButtonProps>(
  forwardRef<HTMLButtonElement, ButtonProps & { readonly "aria-busy"?: boolean }>(function Button({ loading, disabled, ...rest }, ref) {
    return <MantineButton ref={ref} loading={loading ?? false} disabled={disabled === true || loading === true} aria-busy={loading === true ? true : undefined} {...rest} />;
  }),
);
export type { ButtonProps };
