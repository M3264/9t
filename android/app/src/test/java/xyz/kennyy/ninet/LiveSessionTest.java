package xyz.kennyy.ninet;

import static org.junit.Assert.*;

import org.junit.Test;

public class LiveSessionTest {
  @Test
  public void onlyAnEnabledPairedComputerConnectionRestoresAtBoot() {
    assertTrue(LiveSession.restoreAtBoot(true, true, "auto", "http://192.168.1.4:3265"));
    assertTrue(LiveSession.restoreAtBoot(true, true, "lan", "https://computer.example.com"));
    assertFalse(LiveSession.restoreAtBoot(true, false, "lan", "http://192.168.1.4:3265"));
    assertFalse(LiveSession.restoreAtBoot(false, true, "lan", "http://192.168.1.4:3265"));
    assertFalse(LiveSession.restoreAtBoot(true, true, "public", "http://192.168.1.4:3265"));
    assertFalse(LiveSession.restoreAtBoot(true, true, "auto", ""));
  }

  @Test
  public void internetOnlyKeepsCloudLimitsEvenWithASavedLanAddress() {
    assertFalse(LiveSession.deviceConnection("public", "http://192.168.1.4:3265"));
    assertFalse(LiveSession.deviceConnection("auto", ""));
    assertTrue(LiveSession.deviceConnection("auto", "http://192.168.1.4:3265"));
  }

  @Test
  public void processRestartsNeverExtendTheSession() {
    long first = LiveSession.deadline(true, 0, 1000);
    assertEquals(first, LiveSession.deadline(false, first, 100_000));
    assertEquals(first, LiveSession.deadline(false, first, first - 1));
    assertEquals(0, LiveSession.deadline(false, first, first));
    assertEquals(0, LiveSession.deadline(false, first, first + 1));
  }

  @Test
  public void missingAndImpossibleRestartDeadlinesDoNotStartReceiving() {
    assertEquals(0, LiveSession.deadline(false, 0, 1000));
    assertEquals(0, LiveSession.deadline(false, Long.MAX_VALUE, 1000));
  }

  @Test
  public void visibleStartCanBeginANewSessionAfterExpiry() {
    assertEquals(
        30_000_000 + LiveSession.DURATION_MS, LiveSession.deadline(true, 1000, 30_000_000));
  }

  @Test
  public void backgroundRecoveryResumesASavedSessionWithoutExtendingIt() {
    long saved = LiveSession.deadline(true, 0, 1000);
    assertTrue(revive(true, true, false, "public", "", true, 35, saved, 100_000));
    assertEquals(saved, LiveSession.deadline(false, saved, 100_000));
  }

  @Test
  public void backgroundRecoveryCannotCreateACloudSessionAfterBootOrTimeout() {
    assertFalse(revive(true, true, false, "public", "", true, 35, 0, 60_000));
    assertFalse(revive(true, true, false, "public", "", true, 35, Long.MAX_VALUE, 60_000));
  }

  @Test
  public void recoveryAtOrAfterCloudExpiryIsRejected() {
    long saved = LiveSession.deadline(true, 0, 1000);
    assertFalse(revive(true, true, false, "public", "", true, 35, saved, saved));
    assertFalse(revive(true, true, false, "public", "", true, 35, saved, saved + 1));
  }

  @Test
  public void computerConnectionsAreRevivedWheneverTheServiceIsGone() {
    assertTrue(revive(true, true, false, "auto", "http://192.168.1.4:3265", true, 35, 0));
    // A live service must never be restarted underneath itself.
    assertFalse(revive(true, true, true, "auto", "http://192.168.1.4:3265", true, 35, 0));
    assertFalse(revive(false, true, false, "auto", "http://192.168.1.4:3265", true, 35, 0));
    assertFalse(revive(true, false, false, "auto", "http://192.168.1.4:3265", true, 35, 0));
  }

  @Test
  public void backgroundRevivalNeedsTheBatteryExemptionOnlyWhereAndroidEnforcesIt() {
    assertFalse(revive(true, true, false, "lan", "http://192.168.1.4:3265", false, 35, 0));
    assertFalse(
        revive(
            true,
            true,
            false,
            "lan",
            "http://192.168.1.4:3265",
            false,
            LiveSession.BACKGROUND_START_RESTRICTED_SDK,
            0));
    assertTrue(
        revive(
            true,
            true,
            false,
            "lan",
            "http://192.168.1.4:3265",
            false,
            LiveSession.BACKGROUND_START_RESTRICTED_SDK - 1,
            0));
  }

  @Test
  public void aSavedLanEndpointCannotBypassInternetOnlySessionExpiry() {
    assertFalse(revive(true, true, false, "public", "http://192.168.1.4:3265", true, 35, 0));
    assertFalse(revive(true, true, false, "auto", "", true, 35, 0));
  }

  private static boolean revive(
      boolean paired,
      boolean enabled,
      boolean active,
      String mode,
      String lan,
      boolean exempt,
      int sdk,
      long savedDeadline) {
    return revive(paired, enabled, active, mode, lan, exempt, sdk, savedDeadline, 2_000_000_000L);
  }

  private static boolean revive(
      boolean paired,
      boolean enabled,
      boolean active,
      String mode,
      String lan,
      boolean exempt,
      int sdk,
      long savedDeadline,
      long now) {
    return LiveSession.reviveFromBackground(
        paired, enabled, active, mode, lan, exempt, sdk, savedDeadline, now);
  }
}
