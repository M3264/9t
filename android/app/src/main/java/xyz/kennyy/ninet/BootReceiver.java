package xyz.kennyy.ninet;

import android.content.*;

public final class BootReceiver extends BroadcastReceiver {
  public void onReceive(Context c, Intent i) {
    Prefs p = new Prefs(c);
    if (Intent.ACTION_BOOT_COMPLETED.equals(i.getAction()))
      p.p.edit().remove("liveDeadline").apply();
    if (p.paired() && p.p.getBoolean("enabled", true)) SyncJob.schedule(c);
  }
}
