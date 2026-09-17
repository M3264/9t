package xyz.kennyy.ninet;

import android.content.Context;
import android.net.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import javax.crypto.Cipher;
import org.json.JSONObject;

final class Transport {
  final Context context;
  final Prefs prefs;
  final JSONObject credentials;
  static volatile long lanRetryAt;

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
    ConnectivityManager cm = context.getSystemService(ConnectivityManager.class);
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
    URL url = new URL(route.url + "/api/mobile");
    HttpURLConnection conn =
        (HttpURLConnection)
            (route.network == null ? url.openConnection() : route.network.openConnection(url));
    conn.setConnectTimeout(route.label.equals("LAN") ? 1800 : 7000);
    conn.setReadTimeout(15000);
    conn.setInstanceFollowRedirects(false);
    conn.setRequestMethod("POST");
    conn.setDoOutput(true);
    conn.setRequestProperty("Content-Type", "application/json");
    byte[] bytes = env.toString().getBytes(StandardCharsets.UTF_8);
    conn.setFixedLengthStreamingMode(bytes.length);
    try {
      try (OutputStream out = conn.getOutputStream()) {
        out.write(bytes);
      }
      int status = conn.getResponseCode();
      if (status != 200)
        throw new IOException(
            status == 401
                ? "Pairing rejected or phone clock incorrect"
                : "Server returned " + status);
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      try (InputStream in = conn.getInputStream()) {
        byte[] buffer = new byte[16384];
        int n;
        while ((n = in.read(buffer)) != -1) {
          out.write(buffer, 0, n);
          if (out.size() > 5_000_000) throw new IOException("Response too large");
        }
      }
      JSONObject reply = new JSONObject(out.toString("UTF-8"));
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
      return result;
    } finally {
      conn.disconnect();
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
