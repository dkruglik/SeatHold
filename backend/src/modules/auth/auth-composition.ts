import type { PrismaService } from "../../infrastructure/persistence/prisma-service.js";
import type { AppConfig } from "../../config/load-config.js";
import type { Clock } from "../../shared/time/clock.js";
import { LoginService } from "./application/login-service.js";
import type { EmailProvider } from "./application/ports/email-provider.js";
import type { LoginCodeRepository } from "./application/ports/login-code-repository.js";
import type { SessionRepository } from "./application/ports/session-repository.js";
import type { UserRepository } from "./application/ports/user-repository.js";
import { RequestLoginCodeService } from "./application/request-login-code-service.js";
import { SessionService } from "./application/session-service.js";
import { VerifyLoginCodeService } from "./application/verify-login-code-service.js";
import { CryptoSessionTokens } from "./infrastructure/crypto/crypto-session-tokens.js";
import { HmacLoginCodeHasher } from "./infrastructure/crypto/hmac-login-code-hasher.js";
import { RandomLoginCodeGenerator } from "./infrastructure/crypto/random-login-code-generator.js";
import { PrismaLoginCodeRepository } from "./infrastructure/persistence/prisma-login-code-repository.js";
import { PrismaSessionRepository } from "./infrastructure/persistence/prisma-session-repository.js";
import { PrismaUserRepository } from "./infrastructure/persistence/prisma-user-repository.js";

export interface AuthRepositories {
  readonly users: UserRepository;
  readonly codes: LoginCodeRepository;
  readonly sessions: SessionRepository;
}

export interface AuthServiceDeps extends AuthRepositories {
  readonly clock: Clock;
  readonly email: EmailProvider;
}

/** What the HTTP layer of the auth module calls. */
export interface AuthServices {
  readonly requestCode: RequestLoginCodeService;
  readonly login: LoginService;
  readonly sessions: SessionService;
}

export function createPrismaAuthRepositories(prisma: PrismaService): AuthRepositories {
  return {
    users: new PrismaUserRepository(prisma),
    codes: new PrismaLoginCodeRepository(prisma),
    sessions: new PrismaSessionRepository(prisma),
  };
}

/** Wires the auth use cases from validated config and the given ports. Tests pass in-memory or Prisma repositories and a controlled clock. */
export function createAuthServices(config: AppConfig, deps: AuthServiceDeps): AuthServices {
  const { clock, users, codes } = deps;
  const hasher = new HmacLoginCodeHasher(config.authCodePepper);
  const sessions = new SessionService({ clock, sessions: deps.sessions, tokens: new CryptoSessionTokens(), ttlDays: config.sessionTtlDays });
  return {
    requestCode: new RequestLoginCodeService({
      clock,
      codes,
      email: deps.email,
      generator: new RandomLoginCodeGenerator(),
      hasher,
      limits: {
        limit: config.authRequestCodeLimit,
        windowMinutes: config.authRequestCodeWindowMinutes,
        cooldownSeconds: config.authRequestCodeCooldownSeconds,
      },
    }),
    login: new LoginService({ verify: new VerifyLoginCodeService({ clock, codes, hasher, users }), sessions }),
    sessions,
  };
}
