package xyz.kennyy.ninet;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

public final class Wire {
  private static final SecureRandom RANDOM = new SecureRandom();

  public static byte[] randomIv() {
    byte[] iv = new byte[12];
    RANDOM.nextBytes(iv);
    return iv;
  }

  public static byte[] crypt(int mode, byte[] key, byte[] iv, String aad, byte[] data)
      throws Exception {
    if (key.length != 32 || iv.length != 12)
      throw new IllegalArgumentException("Invalid pairing key");
    Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
    c.init(mode, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
    c.updateAAD(aad.getBytes(StandardCharsets.UTF_8));
    return c.doFinal(data);
  }

  public static String b64(byte[] b) {
    return Base64.getEncoder().encodeToString(b);
  }

  public static byte[] decode(String s) {
    return Base64.getDecoder().decode(s);
  }
}
