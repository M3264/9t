package xyz.kennyy.ninet;

import android.app.ActivityManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.os.Build;
import android.os.PowerManager;
import java.text.DateFormat;
import java.util.Date;

/** Local support information only: never includes addresses, pairing keys or item contents. */
final class ReceiverDiagnostics {
  static volatile boolean visible;

  static void visibility(Context c, boolean value) {
    visible = value;
    new Prefs(c)
        .p
        .edit()
        .putLong(value ? "appOpenedAt" : "appHiddenAt", System.currentTimeMillis())
        .apply();
  }

  static synchronized void event(Context c, String message) {
    SharedPreferences p = new Prefs(c).p;
    String previous = p.getString("receiverEvents", "");
    String[] lines = previous.split("\n");
    StringBuilder history = new StringBuilder();
    for (int i = Math.max(0, lines.length - 11); i < lines.length; i++)
      if (!lines[i].isEmpty()) history.append(lines[i]).append('\n');
    history.append(time(System.currentTimeMillis())).append(" · ").append(message);
    p.edit().putString("receiverEvents", history.toString()).apply();
  }

  static void error(Context c, Exception e) {
    SharedPreferences p = new Prefs(c).p;
    // Exception class is enough to distinguish permission, network and storage failures
    // without accidentally copying an endpoint or remote response into a support report.
    String kind = e.getClass().getSimpleName();
    Throwable cause = e.getCause();
    if (cause != null) kind += "/" + cause.getClass().getSimpleName();
    p.edit()
        .putString("receiverError", kind)
        .putLong("receiverErrorAt", System.currentTimeMillis())
        .apply();
    if (!kind.equals(p.getString("receiverLastErrorKind", ""))) event(c, "Receiver error: " + kind);
    p.edit().putString("receiverLastErrorKind", kind).apply();
  }

  static String time(long when) {
    return when == 0
        ? "Not yet"
        : DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.MEDIUM)
            .format(new Date(when));
  }

  static String summary(Context c) {
    SharedPreferences p = new Prefs(c).p;
    return "Connection: "
        + p.getString("socketStatus", "Not started")
        + "\nLast socket message: "
        + time(p.getLong("lastSocketAt", 0))
        + "\nLast change notification: "
        + time(p.getLong("lastChangeAt", 0))
        + "\nLast background sync: "
        + time(p.getLong("lastBackgroundSync", 0))
        + "\nLast receiver check: "
        + time(p.getLong("receiverTickAt", 0));
  }

  static String version(Context c) {
    try {
      return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName;
    } catch (Exception e) {
      return "unknown";
    }
  }

  static String report(Context c) {
    SharedPreferences p = new Prefs(c).p;
    PowerManager power = androidx.core.content.ContextCompat.getSystemService(c, PowerManager.class);
    ConnectivityManager network = androidx.core.content.ContextCompat.getSystemService(c, ConnectivityManager.class);
    return "9t Android "
        + version(c)
        + "\nAndroid "
        + Build.VERSION.RELEASE
        + " (API "
        + Build.VERSION.SDK_INT
        + ")"
        + "\nPhone: "
        + Build.MANUFACTURER
        + " "
        + Build.MODEL
        + "\nReport time: "
        + time(System.currentTimeMillis())
        + "\nReceiving enabled: "
        + p.getBoolean("enabled", true)
        + "\nService running: "
        + ReceiveService.active
        + "\nService mode: "
        + p.getString("receiverMode", "Not started")
        + "\nLast route: "
        + p.getString("route", "Not connected")
        + "\nBattery exemption: "
        + Compat.batteryExempt(c)
        + "\nBackground restricted: "
        + Compat.backgroundRestricted(c)
        + "\nBattery saver: "
        + power.isPowerSaveMode()
        + "\nDevice idle: "
        + (Build.VERSION.SDK_INT >= 23 && power.isDeviceIdleMode())
        + "\nData Saver status: "
        + (Build.VERSION.SDK_INT >= 24 ? network.getRestrictBackgroundStatus() : "Not applicable")
        + "\nNotifications allowed: "
        + androidx.core.app.NotificationManagerCompat.from(c).areNotificationsEnabled()
        + "\nLast app opened: "
        + time(p.getLong("appOpenedAt", 0))
        + "\nLast app hidden: "
        + time(p.getLong("appHiddenAt", 0))
        + "\n"
        + summary(c)
        + "\nLast network response: "
        + time(p.getLong("lastNetworkAt", 0))
        + "\nService heartbeat: " + time(p.getLong("serviceHeartbeatAt", 0))
        + "\nSync phase: " + p.getString("syncPhase", "idle")
        + "\nSync started: " + time(p.getLong("syncStartedAt", 0))
        + "\nSync finished: " + time(p.getLong("syncFinishedAt", 0))
        + "\nHTTP action: " + p.getString("httpAction", "none")
        + "\nHTTP started: " + time(p.getLong("httpStartedAt", 0))
        + "\nHTTP finished: " + time(p.getLong("httpFinishedAt", 0))
        + "\nLast completed sync: "
        + time(p.getLong("lastSync", 0))
        + "\nLast sync source: "
        + p.getString("lastSyncSource", "Not yet")
        + "\nTransfer errors at last sync: "
        + p.getInt("lastTransferErrors", 0)
        + "\nLast file saved: "
        + time(p.getLong("lastFileSavedAt", 0))
        + "\nLast clipboard write: "
        + time(p.getLong("lastClipboardAt", 0))
        + "\nLast error: "
        + p.getString("receiverError", "None")
        + " at "
        + time(p.getLong("receiverErrorAt", 0))
        + "\n\nReceiver events\n"
        + p.getString("receiverEvents", "None");
  }
}
