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

  Prefs(Context c) {
    p = c.getSharedPreferences("9t", Context.MODE_PRIVATE);
  }

  boolean paired() {
    return p.contains("pair");
  }

  private javax.crypto.SecretKey localKey() throws Exception {
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

  synchronized void pair(String code) throws Exception {
    if (!code.trim().startsWith("9t1:"))
      throw new Exception("Paste a pairing code from 9t → Settings → Android devices.");
    JSONObject obj =
        new JSONObject(new String(Wire.decode(code.trim().substring(4)), StandardCharsets.UTF_8));
    if (obj.getInt("v") != 1 || Wire.decode(obj.getString("key")).length != 32)
      throw new Exception("Unsupported pairing code");
    java.util.UUID.fromString(obj.getString("id"));
    java.util.UUID.fromString(obj.getString("instanceId"));
    String url = obj.getString("url");
    boolean local = url.startsWith("http:");
    url = Endpoint.validate(url, local);
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, localKey());
    String encrypted =
        Wire.b64(cipher.getIV())
            + ":"
            + Wire.b64(cipher.doFinal(obj.toString().getBytes(StandardCharsets.UTF_8)));
    p.edit()
        .clear()
        .putString("pair", encrypted)
        .putString(local ? "lan" : "public", url)
        .putLong(
            "since",
            obj.has("createdAt")
                ? java.time.Instant.parse(obj.getString("createdAt")).toEpochMilli()
                : System.currentTimeMillis())
        .putBoolean("enabled", true)
        .putBoolean("copy", true)
        .putBoolean("files", true)
        .commit();
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
