package xyz.kennyy.ninet;

import android.app.job.*;
import android.content.*;
import java.util.concurrent.*;

public final class SyncJob extends JobService {
  private volatile int generation;
  private Future<?> task;
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
    int run = ++generation;
    if (task != null) task.cancel(true);
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
              if (run == generation) jobFinished(p, false);
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
