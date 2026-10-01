import { LeaderboardService } from '../application/leaderboard-service.ts';
import type { Clock, IdGenerator } from '../application/ports.ts';
import { InMemoryLeaderboardStore } from '../infrastructure/in-memory-leaderboard-store.ts';

/** Test support: a clock that only moves when told to. */
export class ManualClock implements Clock {
  #now: number;

  constructor(startAt = 1_700_000_000_000) {
    this.#now = startAt;
  }

  now(): number {
    return this.#now;
  }

  advance(milliseconds: number): void {
    this.#now += milliseconds;
  }
}

/** Test support: ids that are predictable (`session-1`, `session-2`, ...). */
export class SequentialIdGenerator implements IdGenerator {
  #issued = 0;

  next(): string {
    this.#issued += 1;
    return `session-${this.#issued}`;
  }
}

/** Test support: the real use cases wired to the in-memory store and deterministic fakes. */
export function createTestService() {
  const clock = new ManualClock();
  const store = new InMemoryLeaderboardStore();
  const service = new LeaderboardService({ store, clock, ids: new SequentialIdGenerator() });
  return { service, store, clock };
}
