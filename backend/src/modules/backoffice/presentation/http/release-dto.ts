const uuid = { type: "string", format: "uuid" } as const;

export const releaseParamsSchema = {
  type: "object",
  properties: { eventId: uuid, seatId: uuid },
  required: ["eventId", "seatId"],
} as const;

/** Shape only; the 3..500 bound after trimming is a domain rule. `propertyNames` rejects unknown fields (Ajv would strip them). */
export const releaseBodySchema = {
  type: "object",
  properties: { reason: { type: "string", maxLength: 2000 } },
  required: ["reason"],
  propertyNames: { enum: ["reason"] },
  additionalProperties: false,
} as const;

export const releasedSchema = {
  type: "object",
  properties: { seatId: { type: "string" }, eventId: { type: "string" }, released: { type: "boolean" } },
  required: ["seatId", "eventId", "released"],
} as const;
