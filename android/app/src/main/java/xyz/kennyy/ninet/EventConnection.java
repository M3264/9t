package xyz.kennyy.ninet;

import android.content.Context;
import android.os.SystemClock;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Consumer;
import javax.crypto.Cipher;
import okhttp3.*;
import org.json.JSONObject;

/** Persistent authenticated notifications; transfers remain resumable encrypted HTTP RPCs. */
final class EventConnection implements AutoCloseable {
  private final Context context;
  private final Prefs prefs;
  private final Runnable changed;
  private final Consumer<Boolean> stateChanged;
  private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor();
  private WebSocket socket;
  private OkHttpClient client;
  private ScheduledFuture<?> pending, deadline, maintenance;
  private List<Transport.Route> routes = Collections.emptyList();
  private int routeIndex, failures;
  private long generation, lastMessage, connectedAt;
  private volatile boolean closed, ready;
  private String challenge, aad, revision, clientNonce;
  private byte[] key;
  private String deviceId;
  private SocketSequence sequence;

  EventConnection(Context context, Runnable changed, Consumer<Boolean> stateChanged) {
    this.context = context;
    this.prefs = new Prefs(context);
    this.changed = changed;
    this.stateChanged = stateChanged;
  }

  void reconnect() {
    submit(
        () -> {
          if (pending != null) pending.cancel(false);
          // Coalesce bursts of Android network callbacks before replacing the connection.
          pending =
              executor.schedule(
                  () -> {
                    disconnect();
                    routes = Collections.emptyList();
                    routeIndex = 0;
                    failures = 0;
                    connect();
                  },
                  500,
                  TimeUnit.MILLISECONDS);
        });
  }

  private void submit(Runnable task) {
    if (closed) return;
    try {
      executor.execute(
          () -> {
            if (!closed) task.run();
          });
    } catch (RejectedExecutionException ignored) {
    }
  }

  private void connect() {
    if (closed) return;
    pending = null;
    final long ticket = ++generation;
    try {
      if (!prefs.paired() || !prefs.p.getBoolean("enabled", true)) return;
      Transport transport = new Transport(context);
      if (routeIndex >= routes.size()) {
        routes = transport.routes();
        routeIndex = 0;
      }
      if (routes.isEmpty()) throw new IOException("No route");
      final Transport.Route route = routes.get(routeIndex);
      Endpoint.validate(route.url, route.label.equals("LAN"), prefs.p.getBoolean("publicHttp", false));
      key = Wire.decode(transport.credentials.getString("key"));
      deviceId = transport.credentials.getString("id");
      final String instance = transport.credentials.getString("instanceId");
      challenge = null;
      clientNonce = UUID.randomUUID().toString();
      sequence = new SocketSequence();
      revision = "";
      OkHttpClient.Builder builder =
          new OkHttpClient.Builder()
              .connectTimeout(route.label.equals("LAN") ? 2 : 7, TimeUnit.SECONDS)
              .readTimeout(0, TimeUnit.MILLISECONDS)
              .pingInterval(20, TimeUnit.SECONDS)
              .followRedirects(false)
              .followSslRedirects(false)
              .retryOnConnectionFailure(false);
      if (route.network != null) {
        builder.socketFactory(route.network.getSocketFactory());
        builder.dns(hostname -> Arrays.asList(route.network.getAllByName(hostname)));
      }
      client = builder.build();
      prefs.p.edit().putString("socketStatus", "Connecting · polling fallback").apply();
      socket =
          client.newWebSocket(
              new Request.Builder().url(route.url + "/api/mobile/socket").build(),
              new WebSocketListener() {
                @Override
                public void onMessage(WebSocket ws, String text) {
                  submit(
                      () -> {
                        if (ticket != generation) return;
                        try {
                          if (text.length() > 8192)
                            throw new IOException("Socket message too large");
                          JSONObject frame = new JSONObject(text);
                          if (challenge == null) {
                            String nonce = frame.getString("challenge");
                            if (!frame.getString("type").equals("challenge")
                                || frame.getInt("v") != 1
                                || !nonce.matches("[A-Za-z0-9_-]{43}"))
                              throw new IOException("Socket challenge");
                            challenge = nonce;
                            aad = "9t:socket:v1:" + instance + ":" + deviceId + ":" + challenge;
                            byte[] iv = Wire.randomIv();
                            JSONObject auth =
                                new JSONObject()
                                    .put("action", "subscribe")
                                    .put("challenge", challenge)
                                    .put("clientNonce", clientNonce);
                            ws.send(
                                new JSONObject()
                                    .put("id", deviceId)
                                    .put("iv", Wire.b64(iv))
                                    .put(
                                        "data",
                                        Wire.b64(
                                            Wire.crypt(
                                                Cipher.ENCRYPT_MODE,
                                                key,
                                                iv,
                                                aad + ":subscribe",
                                                auth.toString().getBytes(StandardCharsets.UTF_8))))
                                    .toString());
                            return;
                          }
                          JSONObject body =
                              new JSONObject(
                                  new String(
                                      Wire.crypt(
                                          Cipher.DECRYPT_MODE,
                                          key,
                                          Wire.decode(frame.getString("iv")),
                                          aad + ":event:" + clientNonce,
                                          Wire.decode(frame.getString("data"))),
                                      StandardCharsets.UTF_8));
                          sequence.accept(body.getLong("sequence"));
                          String type = body.getString("type"),
                              nextRevision = body.getString("revision");
                          if (!nextRevision.matches("[a-f0-9]{64}")
                              || (!ready && !type.equals("ready"))
                              || (ready && !type.equals("changed") && !type.equals("heartbeat")))
                            throw new IOException("Socket event");
                          lastMessage = SystemClock.elapsedRealtime();
                          prefs
                              .p
                              .edit()
                              .putLong("lastSocketAt", System.currentTimeMillis())
                              .putLong("lastNetworkAt", System.currentTimeMillis())
                              .putString("socketStatus", "Live push · " + route.label)
                              .apply();
                          if (!ready) {
                            ready = true;
                            failures = 0;
                            connectedAt = lastMessage;
                            if (deadline != null) deadline.cancel(false);
                            stateChanged.accept(true);
                            ReceiverDiagnostics.event(
                                context, "Persistent connection authenticated · " + route.label);
                            maintenance =
                                executor.scheduleAtFixedRate(
                                    () -> {
                                      if (ticket != generation) return;
                                      long now = SystemClock.elapsedRealtime();
                                      if (now - lastMessage > 60000)
                                        failed(ticket, new IOException("Socket heartbeat timeout"));
                                      else if (route.label.equals("Internet")
                                          && prefs.p.getString("mode", "auto").equals("auto")
                                          && !prefs.p.getString("lan", "").isEmpty()
                                          && now - connectedAt >= 60000) {
                                        Transport.lanRetryAt = 0;
                                        reconnect();
                                      }
                                    },
                                    20000,
                                    20000,
                                    TimeUnit.MILLISECONDS);
                          }
                          // ready always triggers catch-up; a missed file-watch event is recovered
                          // by revision heartbeats.
                          if (!revision.equals(nextRevision)) {
                            prefs.p.edit().putLong("lastChangeAt", System.currentTimeMillis()).apply();
                            revision = nextRevision;
                            changed.run();
                          }
                        } catch (Exception e) {
                          failed(ticket, e);
                        }
                      });
                }

                @Override
                public void onMessage(WebSocket ws, okio.ByteString bytes) {
                  submit(() -> failed(ticket, new IOException("Unexpected binary event")));
                }

                @Override
                public void onFailure(WebSocket ws, Throwable t, Response response) {
                  if (response != null) response.close();
                  submit(() -> failed(ticket, new IOException("Socket unavailable", t)));
                }

                @Override
                public void onClosing(WebSocket ws, int code, String reason) {
                  ws.close(code, null);
                  submit(() -> failed(ticket, new IOException("Socket closed " + code)));
                }
              });
      deadline =
          executor.schedule(
              () -> failed(ticket, new IOException("Socket handshake timeout")),
              10000,
              TimeUnit.MILLISECONDS);
    } catch (Exception e) {
      failed(ticket, e);
    }
  }

  private void failed(long ticket, Exception error) {
    if (closed || ticket != generation) return;
    ReceiverDiagnostics.error(context, error);
    disconnect();
    prefs.p.edit().putString("socketStatus", "Polling fallback · reconnecting").apply();
    routeIndex++;
    // Avoid minute-long gaps when a public proxy drops the socket.
    long delay =
        routeIndex < routes.size() ? 250 : Math.min(10000, 1000L << Math.min(3, failures++));
    pending = executor.schedule(this::connect, delay, TimeUnit.MILLISECONDS);
  }

  private void disconnect() {
    generation++;
    boolean wasReady = ready;
    ready = false;
    if (deadline != null) deadline.cancel(false);
    if (maintenance != null) maintenance.cancel(false);
    if (socket != null) socket.cancel();
    socket = null;
    if (client != null) {
      client.dispatcher().executorService().shutdown();
      client.connectionPool().evictAll();
      client = null;
    }
    if (wasReady) stateChanged.accept(false);
  }

  @Override
  public void close() {
    closed = true;
    try {
      executor.execute(
          () -> {
            if (pending != null) pending.cancel(false);
            disconnect();
            prefs.p.edit().putString("socketStatus", "Stopped").apply();
          });
    } finally {
      executor.shutdown();
    }
  }
}
