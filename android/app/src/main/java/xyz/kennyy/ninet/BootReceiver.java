package xyz.kennyy.ninet;

import android.content.*;

public final class BootReceiver extends BroadcastReceiver {
  public void onReceive(Context c, Intent i) {
    String action = i.getAction();
    boolean booted = Intent.ACTION_BOOT_COMPLETED.equals(action);
    if (!booted && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) return;
    Prefs p = new Prefs(c);
    // elapsedRealtime restarts at boot, so a saved session deadline is meaningless now.
    if (booted) p.p.edit().remove("liveDeadline").apply();
    if (p.paired() && p.p.getBoolean("enabled", true)) SyncJob.schedule(c);
    // Connected-device receiving is permitted at boot; cloud dataSync is not.
    if (LiveSession.restoreAtBoot(
        p.paired(),
        p.p.getBoolean("enabled", true),
        p.p.getString("mode", "auto"),
        p.p.getString("lan", ""))) {
      try {
        androidx.core.content.ContextCompat.startForegroundService(c,
            new Intent(c, ReceiveService.class).setAction(ReceiveService.RESTORE));
      } catch (RuntimeException e) {
        ReceiverDiagnostics.error(c, e);
      }
    }
  }
}
