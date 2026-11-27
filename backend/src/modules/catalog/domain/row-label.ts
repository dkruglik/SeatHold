const LETTERS = 26;
const CODE_A = 65;

/** Spreadsheet-style row label for a 1-based row number: 1 is A, 26 is Z, 27 is AA, 52 is AZ, 53 is BA. */
export function rowLabel(row: number): string {
  if (!Number.isInteger(row) || row < 1) {
    throw new RangeError("Row number must be an integer of at least 1");
  }
  let label = "";
  for (let rest = row; rest > 0; rest = Math.floor((rest - 1) / LETTERS)) {
    label = String.fromCharCode(CODE_A + ((rest - 1) % LETTERS)) + label;
  }
  return label;
}

/** The labels of rows 1..count, in order. */
export function rowLabels(count: number): string[] {
  return Array.from({ length: count }, (_, index) => rowLabel(index + 1));
}
