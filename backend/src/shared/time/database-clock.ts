import type { PrismaService } from "../../infrastructure/persistence/prisma-service.js";
import { InfrastructureError } from "../errors/app-error.js";
import type { Clock } from "./clock.js";

/** Reads the time from PostgreSQL, so instances with skewed host clocks agree (DECISIONS.md O4). */
export class DatabaseClock implements Clock {
  constructor(private readonly prisma: PrismaService) {}

  async now(): Promise<Date> {
    const rows = await this.prisma.client.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    const row = rows[0];
    if (row === undefined) {
      throw new InfrastructureError("SELECT clock_timestamp() returned no row");
    }
    return row.now;
  }
}
