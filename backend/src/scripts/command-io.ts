/** Where a script's output goes; tests capture it. Scripts print an email and a role, never a secret. */
export interface CommandIo {
  out(line: string): void;
  err(line: string): void;
}
