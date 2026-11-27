import { randomInt } from "node:crypto";
import type { LoginCodeGenerator } from "../../application/ports/login-code-generator.js";

const CODE_SPACE = 1_000_000;

/** Six digits from crypto.randomInt. The draw function is injectable so a test can pin it. */
export class RandomLoginCodeGenerator implements LoginCodeGenerator {
  constructor(private readonly draw: (maxExclusive: number) => number = (max) => randomInt(max)) {}

  generate(): string {
    return String(this.draw(CODE_SPACE)).padStart(6, "0");
  }
}
