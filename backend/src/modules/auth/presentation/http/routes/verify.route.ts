import type { FastifyPluginAsync } from "fastify";
import { ValidationError } from "../../../../../shared/errors/app-error.js";
import { meSchema, toMeDto } from "../auth-dto.js";
import type { AuthRouteOptions } from "../auth-route-options.js";
import { SESSION_COOKIE, setSessionCookie } from "../session-cookie.js";

const bodySchema = {
  type: "object",
  properties: { email: { type: "string", minLength: 1, maxLength: 254 }, code: { type: "string", minLength: 1, maxLength: 32 } },
  required: ["email", "code"],
  additionalProperties: false,
} as const;

/** POST /auth/verify: a right code starts a new session and sets the cookie; anything else is 400 INVALID_CODE with no cookie. */
export const verifyRoute: FastifyPluginAsync<AuthRouteOptions> = async (app, options) => {
  app.post<{ Body: { email: string; code: string } }>(
    "/verify",
    {
      schema: {
        body: bodySchema,
        response: { 200: { type: "object", properties: { user: meSchema }, required: ["user"] } },
      },
      onRequest: [...options.mutationHooks],
    },
    async (request, reply) => {
      const result = await options.services.login.execute({
        email: request.body.email,
        code: request.body.code,
        presentedToken: request.cookies[SESSION_COOKIE],
      });
      if (result.kind === "invalid_code") {
        throw new ValidationError("The code is invalid or has expired", { publicCode: "INVALID_CODE" });
      }
      setSessionCookie(reply, result.token, options.cookie);
      return { user: toMeDto(result.user) };
    },
  );
};
