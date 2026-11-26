/**
 * The source of "now". An operation reads it once and passes that value to every statement it runs,
 * so no SQL calls now() and all steps of one operation agree on the time (DECISIONS.md O4).
 */
export interface Clock {
  now(): Promise<Date>;
}
