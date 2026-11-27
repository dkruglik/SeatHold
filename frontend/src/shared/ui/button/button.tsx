import { Button as MantineButton, createPolymorphicComponent, type ButtonProps } from "@mantine/core";
import { forwardRef } from "react";
import { useNarrow } from "../use-narrow";

/** On a phone the default and the compact sizes become `lg` (50 px tall), so every button is a 44 px tap target. */
function touchSize(size: ButtonProps["size"], narrow: boolean): ButtonProps["size"] {
  return narrow && (size === undefined || String(size).startsWith("compact")) ? "lg" : size;
}

function sizeProp(size: ButtonProps["size"]): { size?: NonNullable<ButtonProps["size"]> } {
  return size === undefined ? {} : { size };
}

/** The shared Button: a loading button is disabled (no double submit) and announces itself as busy. */
export const Button = createPolymorphicComponent<"button", ButtonProps>(
  forwardRef<HTMLButtonElement, ButtonProps & { readonly "aria-busy"?: boolean }>(function Button({ loading, disabled, size, ...rest }, ref) {
    const narrow = useNarrow();
    return <MantineButton ref={ref} {...sizeProp(touchSize(size, narrow))} loading={loading ?? false} disabled={disabled === true || loading === true} aria-busy={loading === true ? true : undefined} {...rest} />;
  }),
);
export type { ButtonProps };
