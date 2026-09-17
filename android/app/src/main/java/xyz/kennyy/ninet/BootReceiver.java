package xyz.kennyy.ninet;

import android.content.*;

public final class BootReceiver extends BroadcastReceiver {
  public void onReceive(Context c, Intent i) {
    Prefs p = new Prefs(c);
    if (p.paired() && p.p.getBoolean("enabled", true)) SyncJob.schedule(c);
  }
}
