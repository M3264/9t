package xyz.kennyy.ninet;

import static org.junit.Assert.*;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

public class ReceiveLoopTest {
  @Test
  public void keepsReceivingAfterTheFailureReporterAlsoThrows() throws Exception {
    AtomicInteger calls = new AtomicInteger();
    CountDownLatch recovered = new CountDownLatch(1);
    try (ReceiveLoop loop =
        new ReceiveLoop(
            Executors.newSingleThreadScheduledExecutor(),
            () -> {
              if (calls.incrementAndGet() == 1) throw new IOException("Network went away");
              recovered.countDown();
            },
            error -> {
              throw new SecurityException("Notification rejected");
            },
            5,
            20)) {
      loop.request();
      assertTrue(
          "The background receiver must retry without opening the app",
          recovered.await(3, TimeUnit.SECONDS));
      assertTrue(calls.get() >= 2);
    }
  }

  @Test
  public void manyReconnectsDuringATransferBecomeOneImmediateFollowUp() throws Exception {
    AtomicInteger calls = new AtomicInteger();
    CountDownLatch started = new CountDownLatch(1),
        finishTransfer = new CountDownLatch(1),
        followedUp = new CountDownLatch(1);
    try (ReceiveLoop loop =
        new ReceiveLoop(
            Executors.newSingleThreadScheduledExecutor(),
            () -> {
              if (calls.incrementAndGet() == 1) {
                started.countDown();
                assertTrue(finishTransfer.await(3, TimeUnit.SECONDS));
              } else followedUp.countDown();
            },
            error -> {
              throw new AssertionError(error);
            },
            60000,
            120000)) {
      loop.request();
      assertTrue(started.await(3, TimeUnit.SECONDS));
      for (int i = 0; i < 100; i++) loop.request();
      assertEquals("Reconnects must not overlap an active download", 1, calls.get());
      finishTransfer.countDown();
      assertTrue(
          "Network recovery should skip the ordinary polling delay",
          followedUp.await(3, TimeUnit.SECONDS));
      assertEquals(2, calls.get());
    }
  }

  @Test
  public void pauseInterruptsTheCurrentTransferAndRejectsFurtherWakeups() throws Exception {
    ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor();
    CountDownLatch started = new CountDownLatch(1);
    AtomicInteger calls = new AtomicInteger();
    ReceiveLoop loop =
        new ReceiveLoop(
            executor,
            () -> {
              calls.incrementAndGet();
              started.countDown();
              new CountDownLatch(1).await();
            },
            error -> {},
            5,
            20);
    try {
      loop.request();
      assertTrue(started.await(3, TimeUnit.SECONDS));
    } finally {
      loop.close();
    }
    loop.request();
    assertTrue(executor.awaitTermination(3, TimeUnit.SECONDS));
    assertEquals(1, calls.get());
  }

  @Test
  public void aCanceledButAlreadyDispatchedTickCannotCreateASecondPollingChain() {
    CapturedScheduler executor = new CapturedScheduler();
    AtomicInteger calls = new AtomicInteger();
    try (ReceiveLoop loop = new ReceiveLoop(executor, calls::incrementAndGet, error -> {}, 5, 20)) {
      loop.request();
      Runnable alreadyDispatched = executor.tasks.get(0);
      loop.request();
      alreadyDispatched.run();
      assertEquals(0, calls.get());
      executor.tasks.get(1).run();
      assertEquals(1, calls.get());
      assertEquals("Only one next poll is scheduled", 3, executor.tasks.size());
    }
    executor.tasks.get(2).run();
    assertEquals("A paused receiver ignores already-dispatched work", 1, calls.get());
  }

  private static final class CapturedScheduler extends ScheduledThreadPoolExecutor {
    final List<Runnable> tasks = new ArrayList<>();

    CapturedScheduler() {
      super(1);
    }

    @Override
    public ScheduledFuture<?> schedule(Runnable command, long delay, TimeUnit unit) {
      tasks.add(command);
      // Tests explicitly dispatch callbacks, including the cancellation race.
      return super.schedule(command, 1, TimeUnit.DAYS);
    }
  }
}
