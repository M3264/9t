package xyz.kennyy.ninet;

import android.app.*;
import android.content.*;
import android.database.Cursor;
import android.net.*;
import android.os.*;
import android.provider.MediaStore;
import java.io.*;
import java.util.*;
import org.json.*;

final class SyncEngine {
  private static final java.util.concurrent.locks.ReentrantLock syncLock = new java.util.concurrent.locks.ReentrantLock();

  static boolean isRunning() { return syncLock.isLocked(); }

  interface Cancel {
    boolean stopped();
  }

  static void run(Context context, Cancel cancel, String source) throws Exception {
    Prefs p = new Prefs(context);
    // Do not silently discard push/job work when a foreground sync is still running.
    if (!syncLock.tryLock(1, java.util.concurrent.TimeUnit.SECONDS))
      throw new IOException("Sync busy; retrying");
    boolean startedInBackground = !ReceiverDiagnostics.visible && !"open app".equals(source);
    try (LocalStore db = new LocalStore(context)) {
      p.p.edit().putLong("syncStartedAt", System.currentTimeMillis())
          .putString("syncActiveSource", source).putString("syncPhase", "outbox").apply();
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
      p.p.edit().putString("syncPhase", "metadata").apply();
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
      java.util.List<JSONObject> pending = db.items("status IN ('pending','receiving','error')");
      // Small text deliveries must not wait behind a large or interrupted file download.
      java.util.Collections.sort(pending, (a, b) -> Boolean.compare(
          "file".equals(a.optString("type")), "file".equals(b.optString("type"))));
      for (JSONObject item : pending) {
        if (cancel.stopped()) return;
        String id = item.getString("id"), type = item.getString("type");
        try {
          p.p.edit().putString("syncPhase", type).apply();
          if (type.equals("file")) {
            if (!p.p.getBoolean("files", true)) continue;
            ConnectivityManager cm = androidx.core.content.ContextCompat.getSystemService(context, ConnectivityManager.class);
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
            if (latest != null && p.p.getBoolean("copy", true)
                && latest.getString("updatedAt").compareTo(p.p.getString("clipRevision", "")) > 0) {
              p.p.edit().putString("pendingClip", latest.getString("id"))
                  .putString("clipRevision", latest.getString("updatedAt")).commit();
              copyPending(context);
            }
          }
        } catch (Exception e) {
          if (cancel.stopped() || Thread.currentThread().isInterrupted()) return;
          // SocketTimeoutException also extends InterruptedIOException: it is a failure,
          // not a user cancellation. Record it and let the next item/pass proceed.
          ReceiverDiagnostics.error(context, e);
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
      long completedAt = System.currentTimeMillis();
      SharedPreferences.Editor diagnostic =
          p.p
              .edit()
              .putLong("lastSync", completedAt)
              .putString("lastSyncSource", source)
              .putInt("lastTransferErrors", errors)
              .remove("receiverLastErrorKind");
      if (startedInBackground && !ReceiverDiagnostics.visible)
        diagnostic.putLong("lastBackgroundSync", completedAt);
      diagnostic.apply();
      p.status(
          errors > 0
              ? errors + " transfer(s) need attention · retrying"
              : "Up to date · " + p.p.getString("route", "Connected"));
    } catch (Exception e) {
      p.status(e.getMessage() == null ? "Waiting for connection" : e.getMessage());
      ReceiverDiagnostics.error(context, e);
      throw e;
    } finally {
      try {
        p.p.edit().putString("syncPhase", "idle").putLong("syncFinishedAt", System.currentTimeMillis()).apply();
      } finally {
        syncLock.unlock();
      }
    }
  }

  static void copyPending(Context c) {
    Prefs p = new Prefs(c);
    String id = p.p.getString("pendingClip", "");
    if (id.isEmpty() || !p.p.getBoolean("copy", true)) return;
    if (androidx.core.content.ContextCompat.getSystemService(c, KeyguardManager.class).isKeyguardLocked()) {
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
                if (Build.VERSION.SDK_INT >= 24) {
                  PersistableBundle extras = new PersistableBundle();
                  extras.putBoolean("android.content.extra.IS_SENSITIVE", true);
                  clip.getDescription().setExtras(extras);
                }
                androidx.core.content.ContextCompat.getSystemService(c, ClipboardManager.class).setPrimaryClip(clip);
                androidx.core.content.ContextCompat.getSystemService(c, NotificationManager.class).cancel(3);
                p.p
                    .edit()
                    .remove("pendingClip")
                    .putLong("lastClipboardAt", System.currentTimeMillis())
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
    if (Build.VERSION.SDK_INT >= 29 && !oldUri.isEmpty()) {
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
    if (filename.trim().isEmpty()) filename = "9t-file";
    if (Build.VERSION.SDK_INT < 29) {
      saveLegacy(c, db, item, partial, filename);
      return;
    }
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
    new Prefs(c).p.edit().putLong("lastFileSavedAt", System.currentTimeMillis()).apply();
    Notices.saved(c, filename, uri, item.optString("mimeType", "application/octet-stream"));
  }
  private static void saveLegacy(Context c, LocalStore db, JSONObject item, File partial, String filename) throws Exception {
    if (androidx.core.content.ContextCompat.checkSelfPermission(c, android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
        != android.content.pm.PackageManager.PERMISSION_GRANTED)
      throw new IOException("Allow storage access in Connect to save downloads");
    File directory = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "9t");
    if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Downloads unavailable");
    // Stable unique name permits retry after process death without duplicate or clobbered files.
    String id = item.getString("id");
    File target = new File(directory, id + "-" + filename);
    if (!target.getCanonicalFile().getParentFile().equals(directory.getCanonicalFile()))
      throw new IOException("Invalid download name");
    File staging = new File(directory, "." + id + ".pending");
    try (InputStream in = new FileInputStream(partial); OutputStream out = new FileOutputStream(staging)) {
      byte[] buffer = new byte[65536];
      int n;
      while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
      ((FileOutputStream) out).getFD().sync();
    }
    if (!staging.renameTo(target)) throw new IOException("Cannot publish download");
    Uri uri = androidx.core.content.FileProvider.getUriForFile(c, c.getPackageName() + ".files", target);
    db.update(id, "uri", uri.toString());
    db.update(id, "status", "saved");
    db.update(id, "error", null);
    partial.delete();
    new Prefs(c).p.edit().putLong("lastFileSavedAt", System.currentTimeMillis()).apply();
    Notices.saved(c, filename, uri, item.optString("mimeType", "application/octet-stream"));
  }

}
