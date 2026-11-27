import { describe, expect, it } from "vitest";
import { rowLabel, rowLabels } from "./row-label.js";

describe("rowLabel", () => {
  it.each([
    [1, "A"],
    [26, "Z"],
    [27, "AA"],
    [28, "AB"],
    [52, "AZ"],
    [53, "BA"],
    [200, "GR"],
  ])("labels row %i as %s", (row, label) => {
    expect(rowLabel(row)).toBe(label);
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects row %s", (row) => {
    expect(() => rowLabel(row)).toThrow(RangeError);
  });

  it("lists the labels of rows 1..n in order, all distinct", () => {
    const labels = rowLabels(200);
    expect(labels).toHaveLength(200);
    expect(labels.slice(24, 29)).toEqual(["Y", "Z", "AA", "AB", "AC"]);
    expect(new Set(labels).size).toBe(200);
  });
});
