package xyz.kennyy.ninet;

/** LAN computer links are continuous; cloud-only sync retains Android's session budget. */
final class LiveSession {
  static final long DURATION_MS = 5 * 3600_000L;

  static boolean deviceConnection(String mode, String lan) {
    return !"public".equals(mode) && lan != null && !lan.isBlank();
  }

  static boolean restoreAtBoot(boolean paired, boolean enabled, String mode, String lan) {
    return paired && enabled && deviceConnection(mode, lan);
  }

  static long deadline(boolean explicitStart, long saved, long now) {
    if (explicitStart) return now + DURATION_MS;
    // elapsedRealtime resets at boot. Reject missing, expired, or impossible old deadlines.
    return saved > now && saved <= now + DURATION_MS ? saved : 0;
  }
}
