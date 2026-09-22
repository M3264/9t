package xyz.kennyy.ninet;

import android.content.*;
import android.security.keystore.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

final class Prefs {
  final SharedPreferences p;
  private final Context context;

  Prefs(Context c) {
    context = c.getApplicationContext();
    p = c.getSharedPreferences("9t", Context.MODE_PRIVATE);
  }

  boolean paired() {
    String raw = p.getString("servers", null);
    if (raw != null) {
      try {
        return new JSONObject(raw).length() > 0;
      } catch (Exception e) {
        return p.contains("pair");
      }
    }
    return p.contains("pair");
  }

  // ---- Multiple servers ----
  // Flat keys below always describe the ACTIVE server, so sync/transport code
  // needs no changes. Profiles persist the per-server slice across switches.
  static final String[] PROFILE_KEYS = {
    "pair", "lan", "public", "mode", "since", "notifiedUpTo"
  };

  JSONObject servers() {
    try {
      String raw = p.getString("servers", null);
      if (raw != null) return new JSONObject(raw);
    } catch (Exception ignored) {
    }
    return new JSONObject();
  }

  String activeServer() {
    return p.getString("activeServer", null);
  }

  static String hostOf(String url) {
    try {
      String h = new java.net.URI(url).getHost();
      if (h != null && !h.isEmpty()) return h;
    } catch (Exception ignored) {
    }
    return "Server";
  }

  private JSONObject snapshotProfile(String name) {
    JSONObject o = new JSONObject();
    try {
      o.put("name", name);
      o.put("pair", p.getString("pair", ""));
      o.put("lan", p.getString("lan", ""));
      o.put("public", p.getString("public", ""));
      o.put("mode", p.getString("mode", "auto"));
      o.put("since", p.getLong("since", 0));
      o.put("notifiedUpTo", p.getLong("notifiedUpTo", 0));
    } catch (Exception ignored) {
    }
    return o;
  }

  private void loadProfile(JSONObject prof) {
    SharedPreferences.Editor e = p.edit();
    e.putString("pair", prof.optString("pair", ""));
    e.putString("lan", prof.optString("lan", ""));
    e.putString("public", prof.optString("public", ""));
    e.putString("mode", prof.optString("mode", "auto"));
    e.putLong("since", prof.optLong("since", 0));
    e.putLong("notifiedUpTo", prof.optLong("notifiedUpTo", 0));
    e.apply();
  }

  /** Persist the active server's flat keys into its profile. */
  synchronized void saveActiveProfile() {
    try {
      String active = activeServer();
      if (active == null) return;
      JSONObject all = servers();
      if (!all.has(active)) return;
      JSONObject prof = all.getJSONObject(active);
      JSONObject snap = snapshotProfile(prof.optString("name", "Server"));
      all.put(active, snap);
      p.edit().putString("servers", all.toString()).apply();
    } catch (Exception ignored) {
    }
  }

  /**
   * One-time migration of legacy single-server state. Returns the active
   * profile id, or null when nothing is paired.
   */
  synchronized String ensureProfiles() {
    try {
      JSONObject all = servers();
      String active = activeServer();
      if (all.length() > 0 && active != null && all.has(active)) return active;
      if (!p.contains("pair")) {
        if (all.length() > 0) {
          String first = all.keys().next();
          p.edit().putString("activeServer", first).apply();
          loadProfile(all.getJSONObject(first));
          return first;
        }
        return null;
      }
      JSONObject creds = credentials();
      String id = creds.getString("instanceId");
      if (all.has(id)) {
        p.edit().putString("activeServer", id).apply();
        saveActiveProfile();
        return id;
      }
      all.put(id, snapshotProfile(hostOf(creds.optString("url", ""))));
      p.edit().putString("servers", all.toString()).putString("activeServer", id).apply();
      return id;
    } catch (Exception e) {
      return null;
    }
  }

  /** Switch the active server. Caller restarts live receiving + sync. */
  synchronized boolean switchServer(String id) {
    try {
      saveActiveProfile();
      JSONObject all = servers();
      if (!all.has(id)) return false;
      loadProfile(all.getJSONObject(id));
      p.edit()
          .putString("activeServer", id)
          .remove("clipRevision")
          .remove("pendingClip")
          .putLong("inboxVersion", System.currentTimeMillis())
          .putString("status", "Switched to " + all.getJSONObject(id).optString("name", "server"))
          .apply();
      Transport.lanRetryAt = 0;
      return true;
    } catch (Exception e) {
      return false;
    }
  }

  synchronized void renameProfile(String id, String name) {
    try {
      JSONObject all = servers();
      if (!all.has(id)) return;
      all.getJSONObject(id).put("name", name);
      p.edit().putString("servers", all.toString()).apply();
    } catch (Exception ignored) {
    }
  }

  /** Remove a profile. Returns the id to activate next, or null when none remain. */
  synchronized String removeProfile(String id) {
    try {
      JSONObject all = servers();
      all.remove(id);
      String next = all.length() > 0 ? all.keys().next() : null;
      SharedPreferences.Editor e = p.edit().putString("servers", all.toString());
      if (next != null) e.putString("activeServer", next);
      else e.remove("activeServer");
      e.apply();
      return next;
    } catch (Exception e) {
      return null;
    }
  }

  /** Reload the active profile's saved values, discarding unsaved flat edits. */
  synchronized void reloadActive() {
    try {
      JSONObject all = servers();
      String active = activeServer();
      if (active != null && all.has(active)) loadProfile(all.getJSONObject(active));
      p.edit().remove("pairReq").apply();
    } catch (Exception ignored) {
    }
  }

  /** Keys that belong to pairing state (wiped only when the last server goes). */
  static final String[] PAIR_STATE_KEYS = {
    "pair", "lan", "public", "mode", "since", "notifiedUpTo", "servers",
    "activeServer", "clipRevision", "pendingClip", "inboxVersion", "status",
    "route", "pairReq", "pendingName"
  };

  private javax.crypto.SecretKey localKey() throws Exception {
    if (android.os.Build.VERSION.SDK_INT < 23 || p.contains("wrappedLocalKey")) return legacyKey();
    KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
    ks.load(null);
    if (!ks.containsAlias("9t-pair")) {
      KeyGenerator gen = KeyGenerator.getInstance("AES", "AndroidKeyStore");
      gen.init(
          new KeyGenParameterSpec.Builder(
                  "9t-pair", KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
              .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
              .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
              .build());
      gen.generateKey();
    }
    return (javax.crypto.SecretKey) ks.getKey("9t-pair", null);
  }

  // Android 5 has RSA AndroidKeyStore keys, but no AES AndroidKeyStore provider.
  // Wrap a random AES key with that non-exportable RSA key; never save the pair key as plaintext.
  @SuppressWarnings("deprecation")
  private javax.crypto.SecretKey legacyKey() throws Exception {
    KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
    ks.load(null);
    String alias = "9t-pair-rsa";
    if (!ks.containsAlias(alias)) {
      if (p.contains("wrappedLocalKey")) throw new java.security.KeyStoreException("Local key unavailable; pair again");
      java.util.Calendar end = java.util.Calendar.getInstance();
      end.add(java.util.Calendar.YEAR, 30);
      java.security.KeyPairGenerator generator = java.security.KeyPairGenerator.getInstance("RSA", "AndroidKeyStore");
      generator.initialize(new android.security.KeyPairGeneratorSpec.Builder(context)
          .setAlias(alias).setKeySize(2048)
          .setSubject(new javax.security.auth.x500.X500Principal("CN=9t"))
          .setSerialNumber(java.math.BigInteger.ONE)
          .setStartDate(new java.util.Date(0)).setEndDate(end.getTime()).build());
      generator.generateKeyPair();
    }
    Cipher rsa = Cipher.getInstance("RSA/ECB/PKCS1Padding");
    byte[] key;
    if (p.contains("wrappedLocalKey")) {
      rsa.init(Cipher.DECRYPT_MODE, ks.getKey(alias, null));
      key = rsa.doFinal(Wire.decode(p.getString("wrappedLocalKey", "")));
    } else {
      key = new byte[32];
      new java.security.SecureRandom().nextBytes(key);
      rsa.init(Cipher.ENCRYPT_MODE, ks.getCertificate(alias).getPublicKey());
      if (!p.edit().putString("wrappedLocalKey", Wire.b64(rsa.doFinal(key))).commit())
        throw new java.io.IOException("Cannot save local key");
    }
    return new javax.crypto.spec.SecretKeySpec(key, "AES");
  }

  synchronized void pair(String code) throws Exception {
    if (!code.trim().startsWith("9t1:"))
      throw new Exception("Paste a pairing code from 9t → Settings → Android devices.");
    JSONObject obj =
        new JSONObject(new String(Wire.decode(code.trim().substring(4)), StandardCharsets.UTF_8));
    if (obj.getInt("v") != 1 || Wire.decode(obj.getString("key")).length != 32)
      throw new Exception("Unsupported pairing code");
    java.util.UUID.fromString(obj.getString("id"));
    String instanceId = obj.getString("instanceId");
    java.util.UUID.fromString(instanceId);
    String url = obj.getString("url");
    boolean local = url.startsWith("http:");
    url = Endpoint.validate(url, local, p.getBoolean("publicHttp", false));
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, localKey());
    String encrypted =
        Wire.b64(cipher.getIV())
            + ":"
            + Wire.b64(cipher.doFinal(obj.toString().getBytes(StandardCharsets.UTF_8)));
    ensureProfiles();
    JSONObject all = servers();
    boolean firstEver = all.length() == 0 && !p.contains("enabled");
    String name = hostOf(url);
    if (all.has(instanceId)) {
      try {
        name = all.getJSONObject(instanceId).optString("name", name);
      } catch (Exception ignored) {
      }
    }
    SharedPreferences.Editor e = p.edit()
        .putString("pair", encrypted)
        .putString(local ? "lan" : "public", url);
    if (!all.has(instanceId)) {
      // Fresh server: never inherit the previous server's route, mode or cursor.
      e.putString(local ? "public" : "lan", "");
      e.putString("mode", "auto");
      e.putLong(
          "since",
          obj.has("createdAt")
              ? java.time.Instant.parse(obj.getString("createdAt")).toEpochMilli()
              : System.currentTimeMillis());
      e.putLong("notifiedUpTo", 0);
    }
    if (firstEver) e.putBoolean("enabled", true).putBoolean("copy", true).putBoolean("files", true);
    e.commit();
    JSONObject snap = snapshotProfile(name);
    all.put(instanceId, snap);
    p.edit().putString("servers", all.toString()).putString("activeServer", instanceId).apply();
    Transport.lanRetryAt = 0;
  }

  JSONObject credentials() throws Exception {
    String[] s = p.getString("pair", "").split(":");
    Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
    c.init(Cipher.DECRYPT_MODE, localKey(), new GCMParameterSpec(128, Wire.decode(s[0])));
    return new JSONObject(new String(c.doFinal(Wire.decode(s[1])), StandardCharsets.UTF_8));
  }

  void status(String message) {
    p.edit().putString("status", message).apply();
  }
}
