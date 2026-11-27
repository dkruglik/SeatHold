import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { UserRepository } from "../../application/ports/user-repository.js";
import { normalizeEmail } from "../../domain/email.js";
import type { Role } from "../../domain/role.js";
import type { User } from "../../domain/user.js";
import { toUser } from "./auth-mappers.js";
import { guarded } from "../../../../shared/persistence/guarded.js";

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return guarded("find user by id", async () => {
      const row = await this.prisma.client.user.findUnique({ where: { id } });
      return row ? toUser(row) : null;
    });
  }

  findByEmail(email: string): Promise<User | null> {
    return guarded("find user by email", async () => {
      const row = await this.prisma.client.user.findUnique({ where: { email: normalizeEmail(email) } });
      return row ? toUser(row) : null;
    });
  }

  createBuyer(email: string, now: Date): Promise<User> {
    return guarded("create buyer", async () => {
      const normalized = normalizeEmail(email);
      // INSERT ... ON CONFLICT DO NOTHING (skipDuplicates), then read: concurrent callers all end with the one row.
      await this.prisma.client.user.createMany({
        data: [{ email: normalized, role: "buyer", createdAt: now }],
        skipDuplicates: true,
      });
      const row = await this.prisma.client.user.findUniqueOrThrow({ where: { email: normalized } });
      return toUser(row);
    });
  }

  setRoleByEmail(email: string, role: Role): Promise<boolean> {
    return guarded("set user role", async () => {
      const result = await this.prisma.client.user.updateMany({
        where: { email: normalizeEmail(email), NOT: { role } },
        data: { role },
      });
      return result.count > 0;
    });
  }
}
