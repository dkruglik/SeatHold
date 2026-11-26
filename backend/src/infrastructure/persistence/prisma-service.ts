import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

/** Owns the Prisma client and its connection pool. Built from config; connect and disconnect are explicit. */
export class PrismaService {
  readonly client: PrismaClient;

  /** `poolMax` caps this instance's connections; instances times poolMax must stay under what RDS Proxy and PostgreSQL accept. */
  constructor(databaseUrl: string, poolMax: number) {
    this.client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max: poolMax }) });
  }

  connect(): Promise<void> {
    return this.client.$connect();
  }

  disconnect(): Promise<void> {
    return this.client.$disconnect();
  }
}
