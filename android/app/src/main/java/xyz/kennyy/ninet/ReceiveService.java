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
  private long deadline;
  private int failures;
  private ConnectivityManager.NetworkCallback callback;
  private PowerManager.WakeLock wakeLock;
  private final Handler handler = new Handler(Looper.getMainLooper());

  @Override
  public int onStartCommand(Intent intent, int flags, int id) {
    Prefs prefs = new Prefs(this);
    if (intent != null && "pause".equals(intent.getAction())) {
      prefs.p.edit().putBoolean("enabled", false).apply();
      SyncJob.cancel(this);
      prefs.status("Receiving paused");
      stopSelf();
      return START_NOT_STICKY;
    }
    if (!prefs.paired() || !prefs.p.getBoolean("enabled", true)) {
      stopSelf();
      return START_NOT_STICKY;
    }
    if (active) return START_STICKY;
    long now = SystemClock.elapsedRealtime();
    // A system restart must preserve the original deadline, not buy another session.
    deadline = LiveSession.deadline(intent != null, prefs.p.getLong("liveDeadline", 0), now);
    if (deadline == 0) {
      stopSelf();
      return START_NOT_STICKY;
    }
    prefs.p.edit().putLong("liveDeadline", deadline).apply();
    SyncJob.schedule(this);
    try {
      startForeground(1, Notices.live(this, "Connecting to your workspace"));
    } catch (RuntimeException e) {
      prefs.status("Android blocked live receiving · scheduled sync remains on");
      stopSelf();
      return START_NOT_STICKY;
    }
    active = true;
    // A foreground notification alone does not keep the CPU awake with the screen off.
    // Bounded to this visible, pausable session and always released on destruction.
    wakeLock =
        getSystemService(PowerManager.class)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "9t:live-receiving");
    wakeLock.acquire(deadline - now);
    handler.postDelayed(this::endSession, deadline - now);
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
    return START_STICKY;
  }

  private void endSession() {
    new Prefs(this).status("Live session ended · scheduled sync remains on");
    stopped = true;
    stopSelf();
  }

  private void tick() {
    if (stopped) return;
    if (SystemClock.elapsedRealtime() >= deadline) {
      handler.post(this::endSession);
      return;
    }
    try {
      SyncEngine.run(
          this,
          () ->
              stopped
                  || Thread.currentThread().isInterrupted()
                  || !new Prefs(this).p.getBoolean("enabled", true));
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
    stopped = true;
    stopSelf();
  }

  @Override
  public void onDestroy() {
    stopped = true;
    active = false;
    handler.removeCallbacksAndMessages(null);
    worker.shutdownNow();
    if (callback != null)
      getSystemService(ConnectivityManager.class).unregisterNetworkCallback(callback);
    if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    stopForeground(STOP_FOREGROUND_REMOVE);
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }
}
