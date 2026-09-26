package xyz.kennyy.ninet;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;

/** One catch-up pass after reboot or app update; periodic sync continues separately. */
public final class BootSyncJob extends JobService {
  private final ExecutorService executor = Executors.newSingleThreadExecutor();
  private Future<?> task;
  private AtomicBoolean cancelled;

  static void schedule(Context context) {
    JobScheduler scheduler = androidx.core.content.ContextCompat.getSystemService(
        context, JobScheduler.class);
    scheduler.schedule(new JobInfo.Builder(10, new ComponentName(context, BootSyncJob.class))
        .setMinimumLatency(1000)
        .build());
  }

  @Override public boolean onStartJob(JobParameters params) {
    AtomicBoolean runCancelled = new AtomicBoolean(false);
    cancelled = runCancelled;
    task = executor.submit(() -> {
      try {
        SyncEngine.run(this,
            () -> runCancelled.get() || Thread.currentThread().isInterrupted(), "boot");
      } catch (Exception e) {
        ReceiverDiagnostics.error(this, e);
      }
      if (!runCancelled.get()) jobFinished(params, false);
    });
    return true;
  }

  @Override public boolean onStopJob(JobParameters params) {
    if (cancelled != null) cancelled.set(true);
    if (task != null) task.cancel(true);
    return true;
  }

  @Override public void onDestroy() {
    if (cancelled != null) cancelled.set(true);
    if (task != null) task.cancel(true);
    executor.shutdownNow();
    super.onDestroy();
  }
}
