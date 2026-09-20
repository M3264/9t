package xyz.kennyy.ninet;

// Pure helpers for link handling, kept dependency-free for JVM tests.
final class Links {
  private Links() {}

  static boolean looksLikeUrl(String text) {
    if (text == null) return false;
    String t = text.trim();
    if (t.isEmpty() || t.length() > 2048 || t.contains(" ") || t.contains("\n")) return false;
    try {
      java.net.URI uri = new java.net.URI(t);
      String scheme = uri.getScheme();
      return ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
          && uri.getHost() != null
          && !uri.getHost().isEmpty();
    } catch (Exception e) {
      return false;
    }
  }

  static String hostOf(String url) {
    try {
      String host = new java.net.URI(url.trim()).getHost();
      return host == null ? url.trim() : host;
    } catch (Exception e) {
      return url.trim();
    }
  }
}
