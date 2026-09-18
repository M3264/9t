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
}
