package xyz.kennyy.ninet;

import java.util.concurrent.*;
import java.util.function.Consumer;

/** One receiver at a time, with coalesced reconnects and a retry scheduled even after a failure. */
final class ReceiveLoop implements AutoCloseable {
  interface Work {
    void run() throws Exception;
  }

  private final ScheduledExecutorService executor;
  private final Work work;
  private final Consumer<Exception> error;
  private volatile long intervalMs;
  private final long maxDelayMs;
  private ScheduledFuture<?> pending;
  private boolean running, requested, closed;
  private int failures;
  private long generation;

  ReceiveLoop(Work work, Consumer<Exception> error) {
    this(Executors.newSingleThreadScheduledExecutor(), work, error, 5000, 120000);
  }

  ReceiveLoop(
      ScheduledExecutorService executor,
      Work work,
      Consumer<Exception> error,
      long intervalMs,
      long maxDelayMs) {
    this.executor = executor;
    this.work = work;
    this.error = error;
    this.intervalMs = intervalMs;
    this.maxDelayMs = maxDelayMs;
  }

  void setInterval(long value) {
    intervalMs = value;
  }

  synchronized void request() {
    if (closed) return;
    if (running) {
      requested = true;
      return;
    }
    if (pending != null) pending.cancel(false);
    schedule(0);
  }

  private void schedule(long delay) {
    long ticket = ++generation;
    pending = executor.schedule(() -> tick(ticket), delay, TimeUnit.MILLISECONDS);
  }

  private void tick(long ticket) {
    synchronized (this) {
      if (closed || ticket != generation) return;
      pending = null;
      running = true;
      requested = false;
    }
    try {
      work.run();
      failures = 0;
    } catch (Exception e) {
      failures = Math.min(5, failures + 1);
      // Reporting (including a notification failure) must not kill the polling loop.
      try {
        error.accept(e);
      } catch (RuntimeException ignored) {
      }
    } finally {
      synchronized (this) {
        running = false;
        if (!closed) schedule(requested ? 0 : Math.min(maxDelayMs, intervalMs << failures));
      }
    }
  }

  @Override
  public synchronized void close() {
    closed = true;
    if (pending != null) pending.cancel(false);
    executor.shutdownNow();
  }
}
