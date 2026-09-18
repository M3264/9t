package xyz.kennyy.ninet;

import android.app.job.*;
import android.content.*;
import android.os.Build;
import android.os.PowerManager;
import android.os.SystemClock;
import java.util.concurrent.*;

public final class SyncJob extends JobService {
  private volatile int generation;
  private Future<?> task;
  private final ExecutorService executor = Executors.newSingleThreadExecutor();

  static void schedule(Context c) {
    // No INTERNET/validated-network constraint: offline Wi-Fi LANs must work.
    JobScheduler scheduler = androidx.core.content.ContextCompat.getSystemService(c, JobScheduler.class);
    // Replacing an existing periodic job resets its window and may cancel running work.
    for (JobInfo job : scheduler.getAllPendingJobs()) if (job.getId() == 9) return;
    scheduler.schedule(
        new JobInfo.Builder(9, new ComponentName(c, SyncJob.class))
            .setPeriodic(15 * 60 * 1000L)
            .setPersisted(true)
            .build());
  }

  static void cancel(Context c) {
    androidx.core.content.ContextCompat.getSystemService(c, JobScheduler.class).cancel(9);
  }

  /**
   * Restarts live receiving when the service is gone. The job is persisted, so this is what brings
   * the connection back after an OEM kill or a dropped session without the user opening the app.
   */
  static void revive(Context c) {
    Prefs prefs = new Prefs(c);
    boolean exempt;
    try {
      exempt = Compat.batteryExempt(c);
    } catch (RuntimeException e) {
      exempt = false;
    }
    if (!LiveSession.reviveFromBackground(
        prefs.paired(),
        prefs.p.getBoolean("enabled", true),
        ReceiveService.active,
        prefs.p.getString("mode", "auto"),
        prefs.p.getString("lan", ""),
        exempt,
        Build.VERSION.SDK_INT,
        prefs.p.getLong("liveDeadline", 0),
        SystemClock.elapsedRealtime())) return;
    try {
      androidx.core.content.ContextCompat.startForegroundService(c,
          new Intent(c, ReceiveService.class).setAction(ReceiveService.RESTORE));
      ReceiverDiagnostics.event(c, "Scheduled job restarted live receiving");
    } catch (RuntimeException e) {
      // Android refuses background starts that are not exempted; polling continues regardless.
      ReceiverDiagnostics.error(c, e);
    }
  }

  public boolean onStartJob(JobParameters p) {
    int run = ++generation;
    if (task != null) task.cancel(true);
    // Restore the persistent socket before potentially lengthy file catch-up.
    revive(this);
    task =
        executor.submit(
            () -> {
              try {
                SyncEngine.run(
                    this,
                    () -> run != generation || Thread.currentThread().isInterrupted(),
                    "scheduled job");
              } catch (Exception ignored) {
              }
              if (run != generation) return;
              jobFinished(p, false);
            });
    return true;
  }

  public boolean onStopJob(JobParameters p) {
    generation++;
    if (task != null) task.cancel(true);
    return true;
  }

  public void onDestroy() {
    generation++;
    executor.shutdownNow();
    super.onDestroy();
  }
}
