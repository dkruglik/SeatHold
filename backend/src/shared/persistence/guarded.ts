import { AppError, InfrastructureError } from "../errors/app-error.js";

function errorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[A-Z0-9]{2,8}$/.test(code) ? code : null;
}

/**
 * Runs a persistence call and turns any database failure into an InfrastructureError.
 * The message holds the operation name and a short error code only: no SQL, values or cause,
 * because driver errors can quote the statement and its parameters.
 */
export async function guarded<T>(operation: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AppError) throw error;
    const code = errorCode(error);
    throw new InfrastructureError(`Persistence failed: ${operation}${code ? ` (${code})` : ""}`);
  }
}
