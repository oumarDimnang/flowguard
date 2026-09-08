import { Injectable } from '@nestjs/common';

/**
 * A fixed-window attempt counter, in memory.
 *
 * @nestjs/throttler's peer range stops at NestJS 11, and what the login route
 * needs is small enough not to be worth forcing it: count attempts per key,
 * refuse past a limit, forget after a window. In-memory is a real limitation
 * — a second server instance keeps its own counts — but this deployment is
 * one process per facility (CLAUDE.md §10), and argon2 already makes each
 * attempt cost tens of milliseconds. This turns "slow" into "bounded".
 */
export interface RateLimitVerdict {
  allowed: boolean;
  /** Seconds until the window resets. Only meaningful when refused. */
  retryAfterSeconds: number;
}

interface Window {
  count: number;
  resetAt: number;
}

@Injectable()
export class LoginRateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly windowMs = 15 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records one attempt against `key` and says whether it was within `limit`. */
  hit(key: string, limit: number): RateLimitVerdict {
    const at = this.now();
    this.pruneIfLarge(at);

    let window = this.windows.get(key);
    if (!window || window.resetAt <= at) {
      window = { count: 0, resetAt: at + this.windowMs };
      this.windows.set(key, window);
    }

    window.count += 1;

    return {
      allowed: window.count <= limit,
      retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - at) / 1000)),
    };
  }

  /** Forget a key — a successful login should not count against the next one. */
  clear(key: string): void {
    this.windows.delete(key);
  }

  /**
   * Bounded memory without a timer. Expired windows are swept only once the
   * map is large, which keeps the common case a single map lookup and means a
   * test never has to wait on an interval.
   */
  private pruneIfLarge(at: number): void {
    if (this.windows.size < 10_000) return;
    for (const [key, window] of this.windows) {
      if (window.resetAt <= at) this.windows.delete(key);
    }
  }
}
