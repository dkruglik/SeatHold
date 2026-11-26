import { describe, expect, it } from "vitest";
import { theme } from "./theme";

describe("base theme", () => {
  it("uses its own ten-shade palette as the primary color, not a Mantine default name", () => {
    expect(theme.primaryColor).toBe("seat");
    expect(theme.colors?.seat).toHaveLength(10);
  });

  it("sets a system font stack without a webfont, the default radius and heading styles", () => {
    expect(theme.fontFamily).toMatch(/system-ui/);
    expect(theme.defaultRadius).toBe("md");
    expect(theme.headings?.fontFamily).toBeDefined();
    expect(theme.headings?.fontWeight).toBeDefined();
  });
});
