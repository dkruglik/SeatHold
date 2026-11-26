import type { Holder } from "../domain/holder.js";
import type { ActiveHold, HoldRepository, HoldTransaction } from "./ports/hold-repository.js";

interface FakeHold {
  id: string;
  key: string;
  expiresAt: Date;
  status: "active" | "expired" | "released";
}

/** Unit-test fake: single-threaded, with rollback by snapshot. It mirrors the port's contract, not the SQL. */
export class InMemoryHoldRepository implements HoldRepository, HoldTransaction {
  /** seat id -> "available" | "sold" | the id of the hold holding it */
  readonly seats = new Map<string, string>();
  private holds: FakeHold[] = [];

  holdCount(): number {
    return this.holds.length;
  }

  async inTransaction<T>(work: (tx: HoldTransaction) => Promise<T>): Promise<T> {
    const holds = this.holds.map((h) => ({ ...h }));
    const seats = new Map(this.seats);
    try {
      return await work(this);
    } catch (error) {
      this.holds = holds;
      this.seats.clear();
      for (const [id, state] of seats) this.seats.set(id, state);
      throw error;
    }
  }

  private active(holder: Holder, eventId: string): FakeHold | undefined {
    const key = `${eventId}:${JSON.stringify(holder)}`;
    return this.holds.find((h) => h.key === key && h.status === "active");
  }

  private view(hold: FakeHold): ActiveHold {
    const seatCount = [...this.seats.values()].filter((s) => s === hold.id).length;
    return { id: hold.id, expiresAt: hold.expiresAt, seatCount };
  }

  expireStaleHold(holder: Holder, eventId: string, now: Date): Promise<void> {
    const hold = this.active(holder, eventId);
    if (hold !== undefined && hold.expiresAt <= now) {
      hold.status = "expired";
      for (const [id, state] of this.seats) if (state === hold.id) this.seats.set(id, "available");
    }
    return Promise.resolve();
  }

  findActiveHold(holder: Holder, eventId: string): Promise<ActiveHold | undefined> {
    const hold = this.active(holder, eventId);
    return Promise.resolve(hold === undefined ? undefined : this.view(hold));
  }

  async getOrCreateActiveHold(holder: Holder, eventId: string, expiresAt: Date): Promise<ActiveHold> {
    const existing = await this.findActiveHold(holder, eventId);
    if (existing !== undefined) return existing;
    const hold: FakeHold = { id: `hold-${this.holds.length + 1}`, key: `${eventId}:${JSON.stringify(holder)}`, expiresAt, status: "active" };
    this.holds.push(hold);
    return this.view(hold);
  }

  tryHoldSeat(input: { seatId: string; holdId: string }): Promise<boolean> {
    if (this.seats.get(input.seatId) !== "available") return Promise.resolve(false);
    this.seats.set(input.seatId, input.holdId);
    return Promise.resolve(true);
  }

  releaseSeat(input: { seatId: string; holdId: string }): Promise<boolean> {
    if (this.seats.get(input.seatId) !== input.holdId) return Promise.resolve(false);
    this.seats.set(input.seatId, "available");
    return Promise.resolve(true);
  }

  seatIdsOfHold(holdId: string): Promise<string[]> {
    return Promise.resolve([...this.seats].filter(([, state]) => state === holdId).map(([id]) => id));
  }

  listActiveVisitorHolds(visitorHash: string): Promise<{ id: string; eventId: string }[]> {
    const holds = this.holds.filter((h) => h.status === "active" && h.key.includes(`"visitorHash":${JSON.stringify(visitorHash)}`));
    return Promise.resolve(holds.map((h) => ({ id: h.id, eventId: h.key.slice(0, h.key.indexOf(":")) })));
  }

  adoptHold(input: { holdId: string; userId: string }): Promise<boolean> {
    const hold = this.holds.find((h) => h.id === input.holdId && h.status === "active");
    if (hold === undefined) return Promise.resolve(false);
    const eventId = hold.key.slice(0, hold.key.indexOf(":"));
    const key = `${eventId}:${JSON.stringify({ kind: "user", userId: input.userId })}`;
    if (this.holds.some((h) => h.key === key && h.status === "active")) return Promise.resolve(false);
    hold.key = key;
    return Promise.resolve(true);
  }

  releaseHold(holdId: string): Promise<void> {
    for (const [id, state] of this.seats) if (state === holdId) this.seats.set(id, "available");
    const hold = this.holds.find((h) => h.id === holdId && h.status === "active");
    if (hold !== undefined) hold.status = "released";
    return Promise.resolve();
  }

  releaseHoldIfEmpty(holdId: string): Promise<void> {
    const hold = this.holds.find((h) => h.id === holdId);
    if (hold !== undefined && ![...this.seats.values()].includes(holdId)) hold.status = "released";
    return Promise.resolve();
  }
}
