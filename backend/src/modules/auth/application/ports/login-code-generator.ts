/** Produces the one-time code that is emailed to the user. */
export interface LoginCodeGenerator {
  /** Six decimal digits, zero-padded. */
  generate(): string;
}
