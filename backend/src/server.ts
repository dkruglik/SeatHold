import { run } from "./run.js";

void run(process.env, {
  stderr: process.stderr,
  exit: (code) => process.exit(code),
  signals: process,
});
