import { AppError, InfrastructureError } from "../../../../shared/errors/app-error.js";

/** Turns a database failure into an InfrastructureError carrying only the operation name and a short error code (no SQL, values or cause). */
export async function guarded<T>(operation: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AppError) throw error;
    const code = (error as { code?: unknown } | null)?.code;
    throw new InfrastructureError(`Persistence failed: ${operation}${typeof code === "string" && /^[A-Z0-9]{2,8}$/.test(code) ? ` (${code})` : ""}`);
  }
}
