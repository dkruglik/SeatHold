import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

/** Owns the Prisma client and its connection pool. Built from config; connect and disconnect are explicit. */
export class PrismaService {
  readonly client: PrismaClient;

  constructor(databaseUrl: string) {
    this.client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  }

  connect(): Promise<void> {
    return this.client.$connect();
  }

  disconnect(): Promise<void> {
    return this.client.$disconnect();
  }
}
