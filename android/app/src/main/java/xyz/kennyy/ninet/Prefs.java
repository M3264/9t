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
    return p.contains("pair");
  }

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
    java.util.UUID.fromString(obj.getString("instanceId"));
    String url = obj.getString("url");
    boolean local = url.startsWith("http:");
    url = Endpoint.validate(url, local, p.getBoolean("publicHttp", false));
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, localKey());
    String encrypted =
        Wire.b64(cipher.getIV())
            + ":"
            + Wire.b64(cipher.doFinal(obj.toString().getBytes(StandardCharsets.UTF_8)));
    String wrappedLocalKey = p.getString("wrappedLocalKey", null);
    p.edit()
        .clear()
        .putString("wrappedLocalKey", wrappedLocalKey)
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
