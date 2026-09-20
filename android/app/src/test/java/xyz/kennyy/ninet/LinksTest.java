package xyz.kennyy.ninet;

import static org.junit.Assert.*;

import org.junit.Test;

public class LinksTest {
  @Test
  public void detectsHttpLinks() {
    assertTrue(Links.looksLikeUrl("https://9t.example.com/s/abc"));
    assertTrue(Links.looksLikeUrl("http://192.168.1.20:3265/o/1"));
    assertTrue(Links.looksLikeUrl("  https://example.com  "));
  }

  @Test
  public void rejectsNonLinks() {
    assertFalse(Links.looksLikeUrl(null));
    assertFalse(Links.looksLikeUrl(""));
    assertFalse(Links.looksLikeUrl("just some words"));
    assertFalse(Links.looksLikeUrl("ftp://example.com/x"));
    assertFalse(Links.looksLikeUrl("https://"));
    assertFalse(Links.looksLikeUrl("https://example.com/a b"));
    assertFalse(Links.looksLikeUrl("docker compose up -d"));
  }

  @Test
  public void extractsHosts() {
    assertEquals("example.com", Links.hostOf("https://example.com/a?b=c"));
    assertEquals("192.168.1.20", Links.hostOf("http://192.168.1.20:3265/"));
  }
}
