package xyz.kennyy.ninet;

import android.content.*;

public final class BootReceiver extends BroadcastReceiver {
  public void onReceive(Context c, Intent i) {
    if (!Intent.ACTION_BOOT_COMPLETED.equals(i.getAction())
        && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(i.getAction())) return;
    Prefs p = new Prefs(c);
    if (Intent.ACTION_BOOT_COMPLETED.equals(i.getAction()))
      p.p.edit().remove("liveDeadline").apply();
    if (p.paired() && p.p.getBoolean("enabled", true)) SyncJob.schedule(c);
    // Connected-device receiving is permitted at boot; cloud dataSync is not.
    if (LiveSession.restoreAtBoot(
        p.paired(),
        p.p.getBoolean("enabled", true),
        p.p.getString("mode", "auto"),
        p.p.getString("lan", ""))) {
      try {
        c.startForegroundService(
            new Intent(c, ReceiveService.class).setAction(ReceiveService.RESTORE));
      } catch (RuntimeException e) {
        ReceiverDiagnostics.error(c, e);
      }
    }
  }
}
