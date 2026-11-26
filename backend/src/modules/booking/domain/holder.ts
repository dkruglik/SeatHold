export type Holder =
  | { readonly kind: "user"; readonly userId: string }
  | { readonly kind: "visitor"; readonly visitorHash: string };

export interface HolderInput {
  readonly userId?: string | undefined;
  readonly visitorHash?: string | undefined;
}

/** Exactly one of user or visitor; anything else is a programming error. */
export function holderFrom(input: HolderInput): Holder {
  const { userId, visitorHash } = input;
  if (userId !== undefined && visitorHash !== undefined) {
    throw new Error("A holder is a user or a visitor, not both");
  }
  if (userId !== undefined) {
    return { kind: "user", userId };
  }
  if (visitorHash !== undefined) {
    return { kind: "visitor", visitorHash };
  }
  throw new Error("A holder needs a user or a visitor");
}

/** Session first, then visitor: a signed-in user wins over a visitor token. Undefined when there is neither. */
export function resolveHolder(input: HolderInput): Holder | undefined {
  if (input.userId !== undefined) {
    return { kind: "user", userId: input.userId };
  }
  return input.visitorHash === undefined ? undefined : { kind: "visitor", visitorHash: input.visitorHash };
}
