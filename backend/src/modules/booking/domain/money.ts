declare const moneyBrand: unique symbol;

/**
 * An amount in integer minor units (cents) of one currency. The brand exists
 * only in the type system, so just `money()` can produce a validated value.
 */
export interface Money {
  readonly minor: number;
  readonly currency: string;
  readonly [moneyBrand]: true;
}

const CURRENCY = /^[A-Z]{3}$/;

export function money(minor: number, currency: string): Money {
  if (!Number.isSafeInteger(minor) || minor < 0) {
    throw new RangeError("Money must be a non-negative integer in minor units");
  }
  if (!CURRENCY.test(currency)) {
    throw new RangeError("Currency must be three uppercase letters");
  }
  return { minor, currency } as Money;
}

/** Unit price times seat count, in minor units, in the unit price's currency. */
export function totalFor(unitPrice: Money, seatCount: number): Money {
  if (!Number.isSafeInteger(seatCount) || seatCount < 0) {
    throw new RangeError("Seat count must be a non-negative integer");
  }
  return money(unitPrice.minor * seatCount, unitPrice.currency);
}
