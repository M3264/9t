package xyz.kennyy.ninet;

import android.app.job.*;
import android.content.*;
import java.util.concurrent.*;

public final class SyncJob extends JobService {
  private volatile boolean stopped;
  private final ExecutorService executor = Executors.newSingleThreadExecutor();

  static void schedule(Context c) {
    // No INTERNET/validated-network constraint: offline Wi-Fi LANs must work.
    JobScheduler scheduler = c.getSystemService(JobScheduler.class);
    // Replacing an existing periodic job resets its window and may cancel running work.
    if (scheduler.getPendingJob(9) != null) return;
    scheduler.schedule(
        new JobInfo.Builder(9, new ComponentName(c, SyncJob.class))
            .setPeriodic(15 * 60 * 1000L)
            .setPersisted(true)
            .build());
  }

  static void cancel(Context c) {
    c.getSystemService(JobScheduler.class).cancel(9);
  }

  public boolean onStartJob(JobParameters p) {
    stopped = false;
    executor.execute(
        () -> {
          try {
            SyncEngine.run(this, () -> stopped);
          } catch (Exception ignored) {
          }
          if (!stopped) jobFinished(p, false);
        });
    return true;
  }

  public boolean onStopJob(JobParameters p) {
    stopped = true;
    return true;
  }

  public void onDestroy() {
    stopped = true;
    executor.shutdownNow();
    super.onDestroy();
  }
}
