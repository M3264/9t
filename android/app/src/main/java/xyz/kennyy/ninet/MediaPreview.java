package xyz.kennyy.ninet;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import java.io.InputStream;

// Sampled thumbnails for inbox cards and the image viewer. Everything is
// downsampled before decoding so a large photo cannot OOM a list scroll.
final class MediaPreview {
  private MediaPreview() {}

  static boolean isImage(String mime) {
    return mime != null && mime.startsWith("image/");
  }

  static boolean isVideo(String mime) {
    return mime != null && mime.startsWith("video/");
  }

  static Bitmap imageThumb(Context c, Uri uri, int maxPx) {
    BitmapFactory.Options bounds = new BitmapFactory.Options();
    bounds.inJustDecodeBounds = true;
    try (InputStream in = c.getContentResolver().openInputStream(uri)) {
      if (in == null) return null;
      BitmapFactory.decodeStream(in, null, bounds);
    } catch (Exception e) {
      return null;
    }
    int sample = 1, w = bounds.outWidth, h = bounds.outHeight;
    if (w <= 0 || h <= 0) return null;
    while (w / sample > maxPx || h / sample > maxPx) sample *= 2;
    BitmapFactory.Options opts = new BitmapFactory.Options();
    opts.inSampleSize = sample;
    try (InputStream in = c.getContentResolver().openInputStream(uri)) {
      if (in == null) return null;
      return BitmapFactory.decodeStream(in, null, opts);
    } catch (Exception | OutOfMemoryError e) {
      return null;
    }
  }

  static Bitmap videoThumb(Context c, Uri uri) {
    MediaMetadataRetriever retriever = new MediaMetadataRetriever();
    try {
      retriever.setDataSource(c, uri);
      Bitmap frame = retriever.getFrameAtTime(0);
      if (frame == null) return null;
      int w = frame.getWidth(), h = frame.getHeight();
      float scale = Math.min(1f, 512f / Math.max(w, h));
      if (scale >= 1f) return frame;
      Bitmap small = Bitmap.createScaledBitmap(frame, Math.max(1, (int) (w * scale)),
          Math.max(1, (int) (h * scale)), true);
      if (small != frame) frame.recycle();
      return small;
    } catch (Exception | OutOfMemoryError e) {
      return null;
    } finally {
      try {
        retriever.release();
      } catch (Exception ignored) {}
    }
  }

  static String videoDuration(Context c, Uri uri) {
    MediaMetadataRetriever retriever = new MediaMetadataRetriever();
    try {
      retriever.setDataSource(c, uri);
      String ms = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
      long total = Long.parseLong(ms) / 1000;
      return String.format(java.util.Locale.ROOT, "%d:%02d", total / 60, total % 60);
    } catch (Exception e) {
      return "";
    } finally {
      try {
        retriever.release();
      } catch (Exception ignored) {}
    }
  }
}
