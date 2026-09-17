package xyz.kennyy.ninet;

import android.app.*;
import android.content.*;
import android.database.Cursor;
import android.net.*;
import android.os.*;
import android.provider.MediaStore;
import java.io.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.*;

final class SyncEngine {
  static final AtomicBoolean running = new AtomicBoolean(false);

  interface Cancel {
    boolean stopped();
  }

  static void run(Context context, Cancel cancel) throws Exception {
    if (!running.compareAndSet(false, true)) return;
    Prefs p = new Prefs(context);
    try (LocalStore db = new LocalStore(context)) {
      if (!p.paired() || !p.p.getBoolean("enabled", true)) return;
      Transport net = new Transport(context);
      for (JSONObject item : db.outbox()) {
        if (cancel.stopped()) return;
        try {
          net.call(
              new JSONObject()
                  .put("action", "sendText")
                  .put("transferId", item.getString("id"))
                  .put("content", item.getString("content")));
          db.sent(item.getString("id"));
        } catch (Transport.RemoteError e) {
          db.outError(item.getString("id"), e.getMessage());
        } catch (Exception e) {
          db.outError(item.getString("id"), e.getMessage());
          throw e;
        }
      }
      String after = "";
      boolean changed = false;
      do {
        if (cancel.stopped()) return;
        JSONObject page = net.call(new JSONObject().put("action", "sync").put("after", after));
        JSONArray items = page.getJSONArray("objects");
        for (int i = 0; i < items.length(); i++)
          changed = db.discover(items.getJSONObject(i), p.p.getLong("since", 0)) || changed;
        after = page.isNull("next") ? "" : page.getString("next");
      } while (!after.isEmpty());
      JSONObject latest = null;
      int errors = 0;
      for (JSONObject item : db.items("status IN ('pending','receiving','error')")) {
        if (cancel.stopped()) return;
        String id = item.getString("id"), type = item.getString("type");
        try {
          if (type.equals("file")) {
            if (!p.p.getBoolean("files", true)) continue;
            ConnectivityManager cm = context.getSystemService(ConnectivityManager.class);
            if (p.p.getBoolean("wifiOnly", false)
                && !p.p.getString("route", "").equals("LAN")
                && cm.isActiveNetworkMetered()) {
              db.update(id, "error", "Waiting for an unmetered connection");
              continue;
            }
            long max = p.p.getLong("maxMb", 500) * 1024 * 1024;
            if (item.optLong("sizeBytes") > max) {
              db.update(id, "error", "Above automatic download limit");
              continue;
            }
            download(context, net, db, item, cancel, max);
            changed = true;
          } else {
            JSONObject text = net.call(new JSONObject().put("action", "text").put("objectId", id));
            changed = true;
            db.update(id, "content", text.optString("content"));
            db.update(id, "status", "saved");
            db.update(id, "error", null);
            if (type.equals("snippet")
                && (latest == null
                    || item.getString("updatedAt").compareTo(latest.getString("updatedAt")) > 0))
              latest = item.put("content", text.optString("content"));
          }
        } catch (InterruptedIOException e) {
          return;
        } catch (Exception e) {
          errors++;
          db.update(id, "status", "error");
          db.update(id, "error", e.getMessage());
        }
      }
      if (latest != null && p.p.getBoolean("copy", true)) {
        String stamp = latest.getString("updatedAt");
        if (stamp.compareTo(p.p.getString("clipRevision", "")) > 0)
          p.p
              .edit()
              .putString("pendingClip", latest.getString("id"))
              .putString("clipRevision", stamp)
              .commit();
      }
      copyPending(context);
      if (changed) p.p.edit().putLong("inboxVersion", System.currentTimeMillis()).apply();
      p.p.edit().putLong("lastSync", System.currentTimeMillis()).apply();
      p.status(
          errors > 0
              ? errors + " transfer(s) need attention · retrying"
              : "Up to date · " + p.p.getString("route", "Connected"));
    } catch (Exception e) {
      p.status(e.getMessage() == null ? "Waiting for connection" : e.getMessage());
      throw e;
    } finally {
      running.set(false);
    }
  }

  static void copyPending(Context c) {
    Prefs p = new Prefs(c);
    String id = p.p.getString("pendingClip", "");
    if (id.isEmpty() || !p.p.getBoolean("copy", true)) return;
    if (c.getSystemService(KeyguardManager.class).isDeviceLocked()) {
      Notices.clip(c);
      return;
    }
    new Handler(Looper.getMainLooper())
        .post(
            () -> {
              try (LocalStore db = new LocalStore(c)) {
                JSONObject item = db.find(id);
                if (item == null) return;
                if (item.optString("content").length() > 100000) {
                  p.p
                      .edit()
                      .remove("pendingClip")
                      .putString(
                          "clipboardStatus", "Large snippet saved · open it to copy a selection")
                      .apply();
                  Notices.clip(c);
                  return;
                }
                ClipData clip = ClipData.newPlainText("9t", item.optString("content"));
                PersistableBundle extras = new PersistableBundle();
                extras.putBoolean("android.content.extra.IS_SENSITIVE", true);
                clip.getDescription().setExtras(extras);
                c.getSystemService(ClipboardManager.class).setPrimaryClip(clip);
                c.getSystemService(NotificationManager.class).cancel(3);
                p.p
                    .edit()
                    .remove("pendingClip")
                    .putString("clipboardStatus", "Latest snippet copied")
                    .apply();
              } catch (Exception e) {
                Notices.clip(c);
              }
            });
  }

  private static void download(
      Context c, Transport net, LocalStore db, JSONObject item, Cancel cancel, long max)
      throws Exception {
    String id = item.getString("id"), revision = item.getString("revision");
    File dir = new File(c.getFilesDir(), "transfers");
    if (!dir.exists() && !dir.mkdirs()) throw new IOException("Cannot create transfer folder");
    // Files are immutable on the server; the revision identifies the partial.
    File partial = new File(dir, id + ".part");
    String oldUri = item.optString("uri", "");
    if (!oldUri.isEmpty()) {
      Uri uri = Uri.parse(oldUri);
      try (Cursor cursor =
          c.getContentResolver()
              .query(uri, new String[] {MediaStore.Downloads.IS_PENDING}, null, null, null)) {
        if (cursor != null && cursor.moveToFirst() && cursor.getInt(0) == 0) {
          db.update(id, "status", "saved");
          partial.delete();
          return;
        }
      }
      c.getContentResolver().delete(uri, null, null);
      db.update(id, "uri", null);
    }
    db.update(id, "status", "receiving");
    long expected = item.optLong("sizeBytes");
    if (partial.length() > expected) partial.delete();
    if (dir.getUsableSpace()
        < Math.max(0, expected - partial.length()) + expected + 10 * 1024 * 1024)
      throw new IOException("Not enough free storage");
    try (RandomAccessFile file = new RandomAccessFile(partial, "rw")) {
      long offset = file.length();
      file.seek(offset);
      boolean done = false;
      while (!done) {
        if (cancel.stopped()) throw new InterruptedIOException("Paused");
        JSONObject chunk =
            net.call(
                new JSONObject()
                    .put("action", "file")
                    .put("objectId", id)
                    .put("revision", revision)
                    .put("offset", offset));
        byte[] data = Wire.decode(chunk.getString("data"));
        long total = chunk.getLong("total");
        if (chunk.getLong("offset") != offset
            || total != expected
            || total > max
            || offset + data.length > total
            || (data.length == 0 && offset < total)) throw new IOException("Invalid file response");
        file.write(data);
        offset += data.length;
        done = chunk.getBoolean("done");
        if (done && offset != total) throw new IOException("Incomplete file");
      }
      file.getFD().sync();
    }
    if (cancel.stopped()) throw new InterruptedIOException("Paused");
    ContentValues values = new ContentValues();
    String filename = item.getString("name").replaceAll("[\\\\/\\p{Cntrl}]", "_");
    if (filename.isBlank()) filename = "9t-file";
    values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
    values.put(
        MediaStore.Downloads.MIME_TYPE, item.optString("mimeType", "application/octet-stream"));
    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/9t");
    values.put(MediaStore.Downloads.IS_PENDING, 1);
    Uri uri = c.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
    if (uri == null) throw new IOException("Unable to save to Downloads");
    db.update(id, "uri", uri.toString());
    try (InputStream input = new FileInputStream(partial);
        OutputStream output = c.getContentResolver().openOutputStream(uri, "w")) {
      if (output == null) throw new IOException("Cannot write download");
      byte[] buf = new byte[65536];
      int n;
      while ((n = input.read(buf)) != -1) output.write(buf, 0, n);
    }
    ContentValues publish = new ContentValues();
    publish.put(MediaStore.Downloads.IS_PENDING, 0);
    c.getContentResolver().update(uri, publish, null, null);
    db.update(id, "status", "saved");
    db.update(id, "error", null);
    partial.delete();
    Notices.saved(c, filename, uri, item.optString("mimeType", "application/octet-stream"));
  }
}
