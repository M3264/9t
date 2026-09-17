package xyz.kennyy.ninet;

import android.app.*;
import android.content.*;
import android.net.*;
import android.os.*;
import java.util.concurrent.*;

public final class ReceiveService extends Service {
  static volatile boolean active;
  private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
  private volatile boolean stopped;
  private long started;
  private int failures;
  private ConnectivityManager.NetworkCallback callback;
  private final Handler handler = new Handler(Looper.getMainLooper());

  @Override
  public void onCreate() {
    super.onCreate();
    started = SystemClock.elapsedRealtime();
    try {
      startForeground(1, Notices.live(this, "Connecting to your workspace"));
    } catch (RuntimeException e) {
      new Prefs(this).status("Android blocked live receiving · scheduled sync remains on");
      stopSelf();
      return;
    }
    active = true;
    callback =
        new ConnectivityManager.NetworkCallback() {
          @Override
          public void onAvailable(Network n) {
            Transport.lanRetryAt = 0;
          }

          @Override
          public void onLost(Network n) {
            Transport.lanRetryAt = 0;
          }
        };
    getSystemService(ConnectivityManager.class)
        .registerNetworkCallback(
            new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_RESTRICTED)
                .build(),
            callback);
    worker.execute(this::tick);
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int id) {
    if (intent != null && "pause".equals(intent.getAction())) {
      new Prefs(this).p.edit().putBoolean("enabled", false).apply();
      SyncJob.cancel(this);
      stopSelf();
    }
    return START_NOT_STICKY;
  }

  private void tick() {
    if (stopped) return;
    // Leave margin beneath Android 15's six-hour daily dataSync allowance.
    if (SystemClock.elapsedRealtime() - started > 5 * 3600_000L) {
      new Prefs(this).status("Live session ended · scheduled sync remains on");
      handler.post(this::stopSelf);
      return;
    }
    try {
      SyncEngine.run(this, () -> stopped);
      failures = 0;
    } catch (Exception e) {
      failures = Math.min(5, failures + 1);
    }
    if (!stopped) {
      getSystemService(NotificationManager.class)
          .notify(1, Notices.live(this, new Prefs(this).p.getString("status", "Connected")));
      try {
        worker.schedule(this::tick, Math.min(120, 5L << failures), TimeUnit.SECONDS);
      } catch (RejectedExecutionException ignored) {
      }
    }
  }

  @Override
  public void onTimeout(int startId, int fgsType) {
    new Prefs(this).status("Android paused live receiving · scheduled sync remains on");
    stopSelf();
  }

  @Override
  public void onDestroy() {
    stopped = true;
    active = false;
    worker.shutdownNow();
    if (callback != null)
      getSystemService(ConnectivityManager.class).unregisterNetworkCallback(callback);
    stopForeground(STOP_FOREGROUND_REMOVE);
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }
}
