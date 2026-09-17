package xyz.kennyy.ninet;

import java.net.URI;

public final class Endpoint {
  public static String validate(String input, boolean lan) {
    if (input.trim().isEmpty()) return "";
    URI u;
    try {
      u = URI.create(input.trim());
    } catch (Exception e) {
      throw new IllegalArgumentException("Enter a full server URL");
    }
    String h = u.getHost(), scheme = u.getScheme();
    if (h == null
        || u.getRawUserInfo() != null
        || u.getQuery() != null
        || u.getFragment() != null
        || (u.getPath() != null && !u.getPath().isEmpty() && !u.getPath().equals("/")))
      throw new IllegalArgumentException("Use a server origin without a path or credentials");
    if (!"https".equals(scheme) && !(lan && "http".equals(scheme) && privateIp(h)))
      throw new IllegalArgumentException(
          "Public connections need HTTPS. HTTP LAN connections need a private IP address.");
    return scheme + "://" + u.getRawAuthority();
  }

  static boolean privateIp(String host) {
    String h = host.replace("[", "").replace("]", "").toLowerCase();
    if (h.contains(":")) return h.matches("f[cd][0-9a-f:]+") && h.indexOf(':') > 0;
    String[] p = h.split("\\.");
    if (p.length != 4) return false;
    int[] n = new int[4];
    try {
      for (int i = 0; i < 4; i++) {
        if (!p[i].matches("[0-9]{1,3}")) return false;
        n[i] = Integer.parseInt(p[i]);
        if (n[i] > 255) return false;
      }
    } catch (Exception e) {
      return false;
    }
    return n[0] == 10 || (n[0] == 192 && n[1] == 168) || (n[0] == 172 && n[1] >= 16 && n[1] <= 31);
  }
}
