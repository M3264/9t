package xyz.kennyy.ninet;

import static org.junit.Assert.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import org.junit.Test;

public class HttpTransferTest {
  @Test public void stalledResponseExpiresAndNextRequestStillSucceeds() throws Exception {
    try (ServerSocket server = new ServerSocket(0, 2, InetAddress.getByName("127.0.0.1"))) {
      ExecutorService executor = Executors.newSingleThreadExecutor();
      Future<?> peer = executor.submit(() -> {
        try (Socket first = server.accept()) {
          readRequest(first);
          first.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nx".getBytes(StandardCharsets.US_ASCII));
          first.getOutputStream().flush();
          // Read until the client's call deadline closes its socket, without sending the body.
          first.setSoTimeout(4000);
          while (first.getInputStream().read() != -1) {}
        } catch (IOException e) { throw new RuntimeException(e); }
        try (Socket second = server.accept()) {
          readRequest(second);
          second.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}".getBytes(StandardCharsets.US_ASCII));
        } catch (IOException e) { throw new RuntimeException(e); }
      });
      try {
        okhttp3.OkHttpClient client = HttpTransfer.client(500);
        String url = "http://127.0.0.1:" + server.getLocalPort();
        long started = System.nanoTime();
        CountDownLatch delivered = new CountDownLatch(1);
        java.util.concurrent.atomic.AtomicInteger timeouts = new java.util.concurrent.atomic.AtomicInteger();
        try (ReceiveLoop loop = new ReceiveLoop(Executors.newSingleThreadScheduledExecutor(),
            () -> {
              assertEquals("{}", new String(HttpTransfer.post(client, url, "{}"), StandardCharsets.UTF_8));
              delivered.countDown();
            }, error -> { if (error instanceof InterruptedIOException) timeouts.incrementAndGet(); }, 10, 100)) {
          loop.request();
          assertTrue("Receiver must recover without another UI request", delivered.await(4, TimeUnit.SECONDS));
          assertEquals(1, timeouts.get());
          assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) < 4000);
        }
        peer.get(4, TimeUnit.SECONDS);
      } finally { executor.shutdownNow(); }
    }
  }

  private static void readRequest(Socket socket) throws IOException {
    socket.setSoTimeout(4000);
    InputStream in = socket.getInputStream();
    int matched = 0;
    byte[] terminator = "\r\n\r\n".getBytes(StandardCharsets.US_ASCII);
    while (matched < 4) {
      int value = in.read();
      if (value < 0) throw new EOFException();
      matched = value == terminator[matched] ? matched + 1 : 0;
    }
    // Tests send a two-byte JSON request.
    if (in.read() < 0 || in.read() < 0) throw new EOFException();
  }
}
