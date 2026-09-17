package xyz.kennyy.ninet;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import javax.crypto.Cipher;
import org.junit.Test;

public class ProtocolTest {
  @Test
  public void endpointsCannotLeakCredentialsToPublicHttp() {
    assertEquals("http://192.168.4.1:3265", Endpoint.validate("http://192.168.4.1:3265/", true));
    assertEquals("https://9t.example.com", Endpoint.validate("https://9t.example.com", false));
    for (String url :
        new String[] {
          "http://example.com",
          "http://8.8.8.8",
          "http://192.168.1.1.evil.test",
          "https://user:pass@example.com",
          "https://example.com/path",
          "https://example.com#fragment",
          "file:///tmp/test",
          "http://127.0.0.1"
        }) {
      assertThrows(url, IllegalArgumentException.class, () -> Endpoint.validate(url, true));
    }
    assertThrows(
        IllegalArgumentException.class, () -> Endpoint.validate("http://192.168.1.2", false));
  }

  @Test
  public void encryptionRejectsWrongPeerDirectionAndTampering() throws Exception {
    byte[] key = new byte[32],
        iv = Wire.randomIv(),
        text = "9t test — 📱".getBytes(StandardCharsets.UTF_8);
    byte[] sealed = Wire.crypt(Cipher.ENCRYPT_MODE, key, iv, "server:device:request", text);
    assertArrayEquals(
        text, Wire.crypt(Cipher.DECRYPT_MODE, key, iv, "server:device:request", sealed));
    assertThrows(
        Exception.class,
        () -> Wire.crypt(Cipher.DECRYPT_MODE, key, iv, "other:device:request", sealed));
    assertThrows(
        Exception.class,
        () -> Wire.crypt(Cipher.DECRYPT_MODE, key, iv, "server:device:response", sealed));
    sealed[0] ^= 1;
    assertThrows(
        Exception.class,
        () -> Wire.crypt(Cipher.DECRYPT_MODE, key, iv, "server:device:request", sealed));
  }
}
