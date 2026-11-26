import { AppError, InfrastructureError } from "../../../../shared/errors/app-error.js";

function errorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[A-Z0-9]{2,8}$/.test(code) ? code : null;
}

/** Turns a database failure into an InfrastructureError carrying the operation name and a short error code only (no SQL, values or cause). */
export async function guarded<T>(operation: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AppError) throw error;
    const code = errorCode(error);
    throw new InfrastructureError(`Persistence failed: ${operation}${code ? ` (${code})` : ""}`);
  }
}
