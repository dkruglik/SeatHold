import type { Clock } from "./clock.js";

/** A clock tests move by hand. */
export class ControlledClock implements Clock {
  private current: Date;

  constructor(start: Date) {
    this.current = new Date(start);
  }

  now(): Promise<Date> {
    return Promise.resolve(new Date(this.current));
  }

  set(time: Date): void {
    this.current = new Date(time);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}
