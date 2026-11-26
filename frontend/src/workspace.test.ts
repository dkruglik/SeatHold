import { describe, expect, it } from "vitest";
import manifest from "../package.json";
import { workspaceName } from "./index";

describe("frontend workspace", () => {
  it("exports the name declared in its package.json", () => {
    expect(workspaceName).toBe(manifest.name);
  });

  it("runs in a browser-like DOM", () => {
    document.body.innerHTML = '<div id="root"></div>';

    expect(document.getElementById("root")).not.toBeNull();
  });
});
