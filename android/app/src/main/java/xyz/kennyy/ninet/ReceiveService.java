package xyz.kennyy.ninet;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.net.*;
import android.os.*;

public final class ReceiveService extends Service {
  static final String START = "xyz.kennyy.ninet.START_RECEIVING";
  static final String RESTORE = "xyz.kennyy.ninet.RESTORE_RECEIVING";
  static volatile boolean active;
  private Prefs prefs;
  private ReceiveLoop loop;
  private EventConnection events;
  private volatile boolean stopped;
  private volatile long deadline;
  private boolean deviceLink;
  private ConnectivityManager.NetworkCallback callback, wifiRequest;
  private BroadcastReceiver screenReceiver;
  private PowerManager.WakeLock wakeLock;
  private long renewWakeAt;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final Runnable endSession =
      () -> {
        markBudgetExhausted();
        finish("Cloud allowance used up · scheduled sync remains on");
      };
  private final Runnable maintainWakeLock =
      new Runnable() {
        @Override
        public void run() {
          if (stopped) return;
          // Long downloads make progress between ticks. A stalled worker must not leak a wake lock.
          long recent =
              Math.max(prefs.p.getLong("receiverTickAt", 0), prefs.p.getLong("lastNetworkAt", 0));
          if (System.currentTimeMillis() - recent < 180000) keepAwake();
          handler.postDelayed(this, 60000);
        }
      };

  @Override
  public void onCreate() {
    super.onCreate();
    prefs = new Prefs(this);
    loop = new ReceiveLoop(this::tick, e -> ReceiverDiagnostics.error(this, e));
    events =
        new EventConnection(
            this,
            loop::request,
            connected -> {
              loop.setInterval(connected ? 60000 : 5000);
              if (!connected) loop.request();
            });
    wakeLock =
        getSystemService(PowerManager.class)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "9t:receiving");
    wakeLock.setReferenceCounted(false);
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int id) {
    if (intent != null && "pause".equals(intent.getAction())) {
      prefs.p.edit().putBoolean("enabled", false).apply();
      SyncJob.cancel(this);
      finish("Receiving paused");
      return START_NOT_STICKY;
    }
    if (stopped || !prefs.paired() || !prefs.p.getBoolean("enabled", true)) {
      stopSelf();
      return START_NOT_STICKY;
    }
    boolean nextDeviceLink =
        LiveSession.deviceConnection(
            prefs.p.getString("mode", "auto"), prefs.p.getString("lan", ""));
    if (active && deviceLink == nextDeviceLink) {
      reconnect();
      return START_STICKY;
    }
    long now = SystemClock.elapsedRealtime();
    boolean visibleStart = intent != null && START.equals(intent.getAction());
    // Schedule before any refusal: the persisted job is what revives receiving later.
    SyncJob.schedule(this);
    if (nextDeviceLink) {
      deadline = Long.MAX_VALUE;
    } else if (visibleStart) {
      deadline = LiveSession.deadline(true, 0, now);
    } else {
      deadline =
          LiveSession.deadline(
              false,
              prefs.p.getLong("liveDeadline", 0),
              now);
    }
    if (deadline == 0) {
      finish("Open 9t to start a cloud live session · scheduled sync remains on");
      return START_NOT_STICKY;
    }
    handler.removeCallbacks(endSession);
    try {
      // Select exactly one type: selecting both also imposes dataSync's time limit on LAN.
      // Remove the previous foreground mode before switching between LAN and cloud.
      if (active) stopForeground(STOP_FOREGROUND_REMOVE);
      startForeground(
          1,
          Notices.live(this, "Connecting to your workspace"),
          nextDeviceLink
              ? ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
              : ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
    } catch (RuntimeException e) {
      ReceiverDiagnostics.error(this, e);
      finish("Android blocked live receiving · open Connect for receiver details");
      return START_NOT_STICKY;
    }
    deviceLink = nextDeviceLink;
    active = true;
    prefs
        .p
        .edit()
        .putLong("liveDeadline", nextDeviceLink ? 0 : deadline)
        .putString(
            "receiverMode",
            nextDeviceLink ? "LAN computer connection" : "Cloud sync (5-hour session)")
        .apply();
    ReceiverDiagnostics.event(
        this,
        (intent == null ? "System restored " : "Started ")
            + (deviceLink ? "LAN receiving" : "cloud receiving"));
    if (!deviceLink) handler.postDelayed(endSession, deadline - now);
    keepAwake();
    watchNetworks();
    watchScreen();
    handler.removeCallbacks(maintainWakeLock);
    handler.postDelayed(maintainWakeLock, 60000);
    events.reconnect();
    loop.request();
    return START_STICKY;
  }

  private void watchNetworks() {
    ConnectivityManager cm = getSystemService(ConnectivityManager.class);
    try {
      if (callback == null) {
        callback =
            new ConnectivityManager.NetworkCallback() {
              @Override
              public void onAvailable(Network n) {
                reconnect();
              }

              @Override
              public void onLost(Network n) {
                reconnect();
              }

              @Override
              public void onCapabilitiesChanged(Network n, NetworkCapabilities caps) {
                reconnect();
              }

              @Override
              public void onBlockedStatusChanged(Network n, boolean blocked) {
                ReceiverDiagnostics.event(
                    ReceiveService.this,
                    blocked
                        ? "Android blocked access to a network"
                        : "Android allowed access to a network");
                reconnect();
              }
            };
        cm.registerNetworkCallback(
            new NetworkRequest.Builder()
                .removeCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
                .build(),
            callback);
      }
      if (deviceLink && wifiRequest == null) {
        wifiRequest =
            new ConnectivityManager.NetworkCallback() {
              @Override
              public void onAvailable(Network n) {
                reconnect();
              }

              @Override
              public void onLost(Network n) {
                reconnect();
              }
            };
        // Keep Wi-Fi available even without internet. No scan or SSID selection is performed.
        cm.requestNetwork(
            new NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .build(),
            wifiRequest);
      } else if (!deviceLink && wifiRequest != null) {
        cm.unregisterNetworkCallback(wifiRequest);
        wifiRequest = null;
      }
    } catch (RuntimeException e) {
      ReceiverDiagnostics.error(this, e);
      // Explicit route attempts still work if an OEM refuses a network request.
    }
  }

  private void watchScreen() {
    if (screenReceiver != null) return;
    BroadcastReceiver receiver =
        new BroadcastReceiver() {
          @Override
          public void onReceive(Context c, Intent intent) {
            if (Intent.ACTION_USER_PRESENT.equals(intent.getAction())) SyncEngine.copyPending(c);
            reconnect();
          }
        };
    IntentFilter filter = new IntentFilter(Intent.ACTION_SCREEN_ON);
    filter.addAction(Intent.ACTION_USER_PRESENT);
    filter.addAction(PowerManager.ACTION_DEVICE_IDLE_MODE_CHANGED);
    filter.addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED);
    try {
      if (Build.VERSION.SDK_INT >= 33) registerReceiver(receiver, filter, RECEIVER_NOT_EXPORTED);
      else registerReceiver(receiver, filter);
      screenReceiver = receiver;
    } catch (RuntimeException e) {
      ReceiverDiagnostics.error(this, e);
    }
  }

  private void reconnect() {
    if (stopped) return;
    Transport.lanRetryAt = 0;
    events.reconnect();
    loop.request();
  }

  private synchronized void keepAwake() {
    if (stopped || !active) return;
    long now = SystemClock.elapsedRealtime();
    if (!wakeLock.isHeld() || now >= renewWakeAt) {
      if (wakeLock.isHeld()) wakeLock.release();
      wakeLock.acquire(10 * 60 * 1000L);
      renewWakeAt = now + 5 * 60 * 1000L;
    }
  }

  private void tick() throws Exception {
    if (stopped) return;
    if (!prefs.paired() || !prefs.p.getBoolean("enabled", true)) {
      handler.post(() -> finish("Receiving paused"));
      return;
    }
    if (SystemClock.elapsedRealtime() >= deadline) {
      handler.post(endSession);
      return;
    }
    prefs.p.edit().putLong("receiverTickAt", System.currentTimeMillis()).apply();
    keepAwake();
    try {
      SyncEngine.run(
          this,
          () ->
              stopped
                  || Thread.currentThread().isInterrupted()
                  || !prefs.p.getBoolean("enabled", true),
          "live receiver");
    } finally {
      if (!stopped) {
        try {
          getSystemService(NotificationManager.class)
              .notify(1, Notices.live(this, prefs.p.getString("status", "Connecting")));
        } catch (RuntimeException e) {
          ReceiverDiagnostics.error(this, e);
        }
      }
    }
  }

  /**
   * Invalidate the saved session on expiry or an Android timeout. Background recovery must not
   * repeatedly restart a service whose allowance has ended.
   */
  private void markBudgetExhausted() {
    prefs
        .p
        .edit()
        .remove("liveDeadline")
        .apply();
  }

  private void finish(String message) {
    prefs.status(message);
    ReceiverDiagnostics.event(this, message);
    stopped = true;
    stopSelf();
  }

  @Override
  public void onTimeout(int startId, int fgsType) {
    markBudgetExhausted();
    finish("Android ended the live session · scheduled sync remains on");
  }

  @Override
  public void onTaskRemoved(Intent rootIntent) {
    ReceiverDiagnostics.event(this, "App removed from recents; receiver remains enabled");
    reconnect();
    super.onTaskRemoved(rootIntent);
  }

  @Override
  public void onDestroy() {
    stopped = true;
    active = false;
    handler.removeCallbacksAndMessages(null);
    events.close();
    loop.close();
    ConnectivityManager cm = getSystemService(ConnectivityManager.class);
    for (ConnectivityManager.NetworkCallback cb :
        new ConnectivityManager.NetworkCallback[] {callback, wifiRequest}) {
      if (cb != null)
        try {
          cm.unregisterNetworkCallback(cb);
        } catch (RuntimeException ignored) {
        }
    }
    if (screenReceiver != null) unregisterReceiver(screenReceiver);
    synchronized (this) {
      if (wakeLock.isHeld()) wakeLock.release();
    }
    ReceiverDiagnostics.event(this, "Receiver service stopped");
    stopForeground(STOP_FOREGROUND_REMOVE);
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }
}
