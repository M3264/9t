package xyz.kennyy.ninet;

/** A restarted process inherits its session budget; only a visible app starts a new one. */
final class LiveSession {
  static final long DURATION_MS = 5 * 3600_000L;

  static long deadline(boolean explicitStart, long saved, long now) {
    if (explicitStart) return now + DURATION_MS;
    // elapsedRealtime resets at boot. Reject missing, expired, or impossible old deadlines.
    return saved > now && saved <= now + DURATION_MS ? saved : 0;
  }
}
