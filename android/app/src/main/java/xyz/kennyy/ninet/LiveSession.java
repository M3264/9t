package xyz.kennyy.ninet;

/** LAN computer links are continuous; cloud-only sync retains Android's session budget. */
final class LiveSession {
  static final long DURATION_MS = 5 * 3600_000L;

  /** Background foreground-service starts are refused from this release unless exempted. */
  static final int BACKGROUND_START_RESTRICTED_SDK = 31;

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

  /**
   * Whether a persisted background trigger may restart live receiving. This is what keeps the
   * connection alive after the OS or an OEM kills the service, without the user opening the app.
   *
   * @param active true when the receiver service is already running
   * @param batteryExempt true when the user granted "Allow background receiving"
   * @param sdkInt the running platform release
   */
  static boolean reviveFromBackground(
      boolean paired,
      boolean enabled,
      boolean active,
      String mode,
      String lan,
      boolean batteryExempt,
      int sdkInt,
      long savedDeadline,
      long now) {
    if (!paired || !enabled || active) return false;
    // Without the exemption the start would throw ForegroundServiceStartNotAllowedException.
    if (sdkInt >= BACKGROUND_START_RESTRICTED_SDK && !batteryExempt) return false;
    if (deviceConnection(mode, lan)) return true;
    // A recovery must never mint a fresh cloud budget after expiry or reboot.
    return deadline(false, savedDeadline, now) != 0;
  }
}
