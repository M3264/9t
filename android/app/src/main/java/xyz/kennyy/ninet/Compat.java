package xyz.kennyy.ninet;

import android.app.ActivityManager;
import android.content.Context;
import android.os.Build;
import android.os.PowerManager;
import androidx.core.content.ContextCompat;

final class Compat {
  static boolean batteryExempt(Context c) {
    return Build.VERSION.SDK_INT < 23 || ContextCompat.getSystemService(c, PowerManager.class)
        .isIgnoringBatteryOptimizations(c.getPackageName());
  }
  static boolean backgroundRestricted(Context c) {
    return Build.VERSION.SDK_INT >= 28 && ContextCompat.getSystemService(c, ActivityManager.class)
        .isBackgroundRestricted();
  }
}
