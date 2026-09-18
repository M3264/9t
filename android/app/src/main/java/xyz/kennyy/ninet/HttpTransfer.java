package xyz.kennyy.ninet;

import java.io.*;
import java.util.concurrent.TimeUnit;
import okhttp3.*;

/** A deadline covers DNS, connect, request writes and the entire response body. */
final class HttpTransfer {
  static OkHttpClient client(long timeoutMs) {
    return new OkHttpClient.Builder().callTimeout(timeoutMs, TimeUnit.MILLISECONDS)
        .connectTimeout(7, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS).followRedirects(false)
        .followSslRedirects(false).retryOnConnectionFailure(false).build();
  }

  static byte[] post(OkHttpClient client, String url, String json) throws IOException {
    Request request = new Request.Builder().url(url)
        .post(RequestBody.create(json, MediaType.get("application/json"))).build();
    try (Response response = client.newCall(request).execute()) {
      if (response.code() != 200) throw new IOException("HTTP status " + response.code());
      if (response.body() == null) throw new IOException("Empty HTTP response");
      ByteArrayOutputStream result = new ByteArrayOutputStream();
      try (InputStream in = response.body().byteStream()) {
        byte[] buffer = new byte[16384];
        int n;
        while ((n = in.read(buffer)) != -1) {
          if (result.size() + n > 5_000_000) throw new IOException("Response too large");
          result.write(buffer, 0, n);
        }
      }
      return result.toByteArray();
    }
  }
}
