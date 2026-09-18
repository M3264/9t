package xyz.kennyy.ninet;

import android.content.Context;
import android.net.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import javax.crypto.Cipher;
import org.json.JSONObject;

final class Transport {
  final Context context;
  final Prefs prefs;
  final JSONObject credentials;
  static volatile long lanRetryAt;
  private static final okhttp3.OkHttpClient HTTP = HttpTransfer.client(30000);
  private final Map<Network, okhttp3.OkHttpClient> clients = new HashMap<>();

  static final class Route {
    final String url, label;
    final Network network;

    Route(String u, String l, Network n) {
      url = u;
      label = l;
      network = n;
    }
  }

  Transport(Context c) throws Exception {
    context = c;
    prefs = new Prefs(c);
    credentials = prefs.credentials();
  }

  List<Route> routes() {
    List<Route> routes = new ArrayList<>();
    String mode = prefs.p.getString("mode", "auto"),
        lan = prefs.p.getString("lan", ""),
        remote = prefs.p.getString("public", "");
    ConnectivityManager cm = androidx.core.content.ContextCompat.getSystemService(context, ConnectivityManager.class);
    if (!lan.isEmpty()
        && !mode.equals("public")
        && (System.currentTimeMillis() >= lanRetryAt || mode.equals("lan") || remote.isEmpty())) {
      for (Network n : cm.getAllNetworks()) {
        NetworkCapabilities caps = cm.getNetworkCapabilities(n);
        if (caps != null
            && (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)))
          routes.add(new Route(lan, "LAN", n));
      }
      // Also permits an explicitly configured private VPN route.
      routes.add(new Route(lan, "LAN", null));
    }
    if (!remote.isEmpty() && !mode.equals("lan")) routes.add(new Route(remote, "Internet", null));
    return routes;
  }

  JSONObject call(JSONObject body) throws Exception {
    Exception last = null;
    for (Route route : routes()) {
      try {
        JSONObject result = callAt(route, body);
        prefs.p.edit().putString("route", route.label).apply();
        if (route.label.equals("LAN")) lanRetryAt = 0;
        return result;
      } catch (RemoteError e) {
        throw e;
      } catch (Exception e) {
        last = e;
        if (route.label.equals("LAN")) lanRetryAt = System.currentTimeMillis() + 45000;
      }
    }
    throw new IOException(
        last == null
            ? "No route configured. Add a LAN or HTTPS address."
            : "Reconnecting · " + last.getMessage(),
        last);
  }

  JSONObject callAt(Route route, JSONObject body) throws Exception {
    Endpoint.validate(route.url, route.label.equals("LAN"));
    String requestId = UUID.randomUUID().toString();
    body.put("requestId", requestId).put("timestamp", System.currentTimeMillis());
    String aad = "9t:v1:" + credentials.getString("instanceId") + ":" + credentials.getString("id");
    byte[] key = Wire.decode(credentials.getString("key")), iv = Wire.randomIv();
    JSONObject env =
        new JSONObject()
            .put("id", credentials.getString("id"))
            .put("iv", Wire.b64(iv))
            .put(
                "data",
                Wire.b64(
                    Wire.crypt(
                        Cipher.ENCRYPT_MODE,
                        key,
                        iv,
                        aad + ":request",
                        body.toString().getBytes(StandardCharsets.UTF_8))));
    okhttp3.OkHttpClient client = clients.get(route.network);
    if (client == null) {
      okhttp3.OkHttpClient.Builder builder = HTTP.newBuilder()
          .connectTimeout(route.label.equals("LAN") ? 1800 : 7000, TimeUnit.MILLISECONDS);
      if (route.network != null) {
        builder.socketFactory(route.network.getSocketFactory());
        builder.dns(host -> Arrays.asList(route.network.getAllByName(host)));
      }
      client = builder.build();
      clients.put(route.network, client);
    }
    prefs.p.edit().putLong("httpStartedAt", System.currentTimeMillis())
        .putString("httpAction", body.optString("action")).apply();
    try {
      byte[] response = HttpTransfer.post(client, route.url + "/api/mobile", env.toString());
      JSONObject reply = new JSONObject(new String(response, StandardCharsets.UTF_8));
      JSONObject result =
          new JSONObject(
              new String(
                  Wire.crypt(
                      Cipher.DECRYPT_MODE,
                      key,
                      Wire.decode(reply.getString("iv")),
                      aad + ":response:" + requestId,
                      Wire.decode(reply.getString("data"))),
                  StandardCharsets.UTF_8));
      if (result.has("error"))
        throw new RemoteError(result.optString("error"), result.optInt("code"));
      prefs.p.edit().putLong("lastNetworkAt", System.currentTimeMillis()).apply();
      return result;
    } finally {
      prefs.p.edit().putLong("httpFinishedAt", System.currentTimeMillis()).apply();
    }
  }

  static final class RemoteError extends IOException {
    final int code;

    RemoteError(String s, int c) {
      super(s);
      code = c;
    }
  }
}
