package xyz.kennyy.ninet;

import android.content.*;
import android.database.Cursor;
import android.database.sqlite.*;
import java.util.*;
import org.json.*;

final class LocalStore extends SQLiteOpenHelper {
  private final Context ctx;
  private final String srv;

  LocalStore(Context c) {
    super(c, "9t.db", null, 3);
    ctx = c.getApplicationContext();
    String id = new Prefs(ctx).ensureProfiles();
    srv = id == null ? "" : id;
  }

  public void onCreate(SQLiteDatabase db) {
    db.execSQL(
        "CREATE TABLE inbox (server TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, revision TEXT NOT NULL,"
            + " metadata TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', uri TEXT, content TEXT,"
            + " error TEXT, pinned INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (server, id))");
    db.execSQL("CREATE TABLE outbox (id TEXT PRIMARY KEY, content TEXT NOT NULL, error TEXT,"
        + " kind TEXT NOT NULL DEFAULT 'snippet', name TEXT, server TEXT NOT NULL DEFAULT '')");
    db.execSQL("CREATE TABLE outfiles (id TEXT PRIMARY KEY, uri TEXT NOT NULL, name TEXT NOT NULL,"
        + " mime TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0, offset INTEGER NOT NULL DEFAULT 0,"
        + " error TEXT, server TEXT NOT NULL DEFAULT '')");
    db.execSQL("CREATE INDEX IF NOT EXISTS idx_inbox_server ON inbox(server)");
  }

  public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
    if (oldVersion < 2) {
      db.execSQL("ALTER TABLE inbox ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
      db.execSQL("ALTER TABLE outbox ADD COLUMN kind TEXT NOT NULL DEFAULT 'snippet'");
      db.execSQL("ALTER TABLE outbox ADD COLUMN name TEXT");
      db.execSQL("CREATE TABLE IF NOT EXISTS outfiles (id TEXT PRIMARY KEY, uri TEXT NOT NULL,"
          + " name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0,"
          + " offset INTEGER NOT NULL DEFAULT 0, error TEXT)");
    }
    if (oldVersion < 3) {
      String backfill = "";
      try {
        String id = new Prefs(ctx).ensureProfiles();
        if (id != null) backfill = id;
      } catch (Exception ignored) {
      }
      // Same 4-letter object id can exist on two servers: key inbox by (server, id).
      db.execSQL(
          "CREATE TABLE inbox_new (server TEXT NOT NULL DEFAULT '', id TEXT NOT NULL,"
              + " revision TEXT NOT NULL, metadata TEXT NOT NULL,"
              + " status TEXT NOT NULL DEFAULT 'pending', uri TEXT, content TEXT,"
              + " error TEXT, pinned INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (server, id))");
      db.execSQL(
          "INSERT INTO inbox_new (server, id, revision, metadata, status, uri, content, error, pinned)"
              + " SELECT ?, id, revision, metadata, status, uri, content, error, pinned FROM inbox",
          new String[] {backfill});
      db.execSQL("DROP TABLE inbox");
      db.execSQL("ALTER TABLE inbox_new RENAME TO inbox");
      db.execSQL("CREATE INDEX IF NOT EXISTS idx_inbox_server ON inbox(server)");
      db.execSQL("ALTER TABLE outbox ADD COLUMN server TEXT NOT NULL DEFAULT ''");
      db.execSQL("ALTER TABLE outfiles ADD COLUMN server TEXT NOT NULL DEFAULT ''");
      db.execSQL("UPDATE outbox SET server=? WHERE server=''", new String[] {backfill});
      db.execSQL("UPDATE outfiles SET server=? WHERE server=''", new String[] {backfill});
    }
  }

  private String[] idArgs(String id) {
    return new String[] {srv, id};
  }

  boolean discover(JSONObject o, long since) throws Exception {
    String id = o.getString("id"), rev = o.getString("updatedAt");
    JSONObject old = find(id);
    if (old != null && "hidden".equals(old.optString("status"))
        && old.optString("createdAt").isEmpty()) {
      // An upload can be hidden before its first metadata sync. Bind the marker
      // to the server creation time so a later reuse of this ID is still visible.
      ContentValues marker = new ContentValues();
      marker.put("metadata", new JSONObject().put("id", id)
          .put("createdAt", o.getString("createdAt")).toString());
      marker.put("revision", rev);
      getWritableDatabase().update("inbox", marker, "server=? AND id=?", idArgs(id));
      return false;
    }
    boolean sameObject = old != null && o.getString("createdAt").equals(old.optString("createdAt"));
    if (sameObject && "hidden".equals(old.optString("status"))) return false;
    if (sameObject && rev.equals(old.optString("revision"))) return false;
    boolean sentFromPhone = old != null && old.optBoolean("sentFromPhone")
        && (sameObject || old.optString("createdAt").isEmpty());
    if (sentFromPhone) o.put("sentFromPhone", true);
    ContentValues v = new ContentValues();
    v.put("server", srv);
    v.put("id", id);
    v.put("revision", rev);
    v.put("metadata", o.toString());
    boolean before = java.time.Instant.parse(o.getString("createdAt")).toEpochMilli() < since;
    v.put("status", sentFromPhone || before ? "available" : "pending");
    if (sentFromPhone && old.optString("status").equals("pending"))
      v.put("status", "pending");
    // Already downloaded files need no new copy for rename/pin-only edits.
    if (sameObject && o.getString("type").equals("file")) {
      v.put("status", old.optString("status"));
      if (old.has("uri")) v.put("uri", old.optString("uri"));
    }
    getWritableDatabase().insertWithOnConflict("inbox", null, v, SQLiteDatabase.CONFLICT_REPLACE);
    return true;
  }

  JSONObject find(String id) throws Exception {
    try (Cursor c =
        getReadableDatabase().query("inbox", null, "server=? AND id=?", idArgs(id), null, null, null)) {
      return c.moveToFirst() ? row(c) : null;
    }
  }

  List<JSONObject> items(String where) throws Exception {
    String selection = where == null ? "server=? AND status!='hidden'"
        : "(server=? AND status!='hidden') AND (" + where + ")";
    List<JSONObject> list = new ArrayList<>();
    try (Cursor c =
        getReadableDatabase().query("inbox", null, selection, new String[] {srv}, null, null, "pinned DESC, revision DESC")) {
      while (c.moveToNext()) list.add(row(c));
    }
    return list;
  }

  private JSONObject row(Cursor c) throws Exception {
    JSONObject o = new JSONObject(c.getString(c.getColumnIndexOrThrow("metadata")));
    for (String key : new String[] {"revision", "status", "uri", "content", "error"}) {
      String value = c.getString(c.getColumnIndexOrThrow(key));
      if (value != null) o.put(key, value);
    }
    o.put("pinned", c.getInt(c.getColumnIndexOrThrow("pinned")) != 0);
    return o;
  }

  void update(String id, String key, String value) {
    ContentValues v = new ContentValues();
    v.put(key, value);
    getWritableDatabase().update("inbox", v, "server=? AND id=?", idArgs(id));
  }

  void setPinned(String id, boolean pinned) {
    ContentValues v = new ContentValues();
    v.put("pinned", pinned ? 1 : 0);
    getWritableDatabase().update("inbox", v, "server=? AND id=?", idArgs(id));
  }

  void remove(String id) throws Exception {
    JSONObject old = find(id);
    if (old == null) return;
    // Keep only the identity needed to prevent the server copy returning on sync.
    JSONObject marker = new JSONObject().put("id", id).put("createdAt", old.optString("createdAt"));
    ContentValues v = new ContentValues();
    v.put("metadata", marker.toString());
    v.put("status", "hidden");
    v.putNull("uri");
    v.putNull("content");
    v.putNull("error");
    getWritableDatabase().update("inbox", v, "server=? AND id=?", idArgs(id));
  }

  void clearInbox() throws Exception {
    for (JSONObject item : items(null)) remove(item.getString("id"));
  }

  String enqueue(String content) {
    return enqueueKind(content, "snippet", null);
  }

  String enqueueKind(String content, String kind, String name) {
    String id = UUID.randomUUID().toString();
    ContentValues v = new ContentValues();
    v.put("id", id);
    v.put("content", content);
    v.put("kind", kind);
    v.put("server", srv);
    if (name != null) v.put("name", name);
    getWritableDatabase().insertOrThrow("outbox", null, v);
    return id;
  }

  List<JSONObject> outbox() throws Exception {
    List<JSONObject> list = new ArrayList<>();
    try (Cursor c = getReadableDatabase().rawQuery("SELECT id,content,error,kind,name FROM outbox WHERE server=?", new String[] {srv})) {
      while (c.moveToNext())
        list.add(
            new JSONObject()
                .put("id", c.getString(0))
                .put("content", c.getString(1))
                .put("error", c.getString(2))
                .put("kind", c.getString(3) == null ? "snippet" : c.getString(3))
                .put("name", c.getString(4)));
    }
    return list;
  }

  void sent(String id) {
    getWritableDatabase().delete("outbox", "server=? AND id=?", idArgs(id));
  }

  void outError(String id, String error) {
    ContentValues v = new ContentValues();
    v.put("error", error);
    getWritableDatabase().update("outbox", v, "server=? AND id=?", idArgs(id));
  }

  void stageFile(String id, String uri, String name, String mime, long size) {
    ContentValues v = new ContentValues();
    v.put("id", id);
    v.put("uri", uri);
    v.put("name", name);
    v.put("mime", mime);
    v.put("size", size);
    v.put("offset", 0);
    v.put("server", srv);
    getWritableDatabase().insertOrThrow("outfiles", null, v);
  }

  List<JSONObject> outfiles() throws Exception {
    List<JSONObject> list = new ArrayList<>();
    try (Cursor c = getReadableDatabase().rawQuery(
        "SELECT id,uri,name,mime,size,offset,error FROM outfiles WHERE server=?", new String[] {srv})) {
      while (c.moveToNext())
        list.add(
            new JSONObject()
                .put("id", c.getString(0))
                .put("uri", c.getString(1))
                .put("name", c.getString(2))
                .put("mime", c.getString(3))
                .put("size", c.getLong(4))
                .put("offset", c.getLong(5))
                .put("error", c.getString(6)));
    }
    return list;
  }

  void fileProgress(String id, long offset) {
    ContentValues v = new ContentValues();
    v.put("offset", offset);
    v.put("error", (String) null);
    getWritableDatabase().update("outfiles", v, "server=? AND id=?", idArgs(id));
  }

  void fileError(String id, String error) {
    ContentValues v = new ContentValues();
    v.put("error", error);
    getWritableDatabase().update("outfiles", v, "server=? AND id=?", idArgs(id));
  }

  void fileSent(String id) {
    getWritableDatabase().delete("outfiles", "server=? AND id=?", idArgs(id));
  }

  void fileUploaded(String objectId, JSONObject file, long size) throws Exception {
    JSONObject old = find(objectId);
    if (old != null && "hidden".equals(old.optString("status"))) return;
    JSONObject metadata = old != null ? old : new JSONObject()
        .put("id", objectId)
        .put("type", "file")
        .put("name", file.getString("name"))
        .put("mimeType", file.optString("mime", "application/octet-stream"))
        .put("sizeBytes", size)
        .put("createdAt", "")
        .put("updatedAt", "");
    metadata.put("sentFromPhone", true);
    ContentValues v = new ContentValues();
    v.put("server", srv);
    v.put("id", objectId);
    v.put("revision", old == null ? "" : old.optString("revision"));
    v.put("metadata", metadata.toString());
    v.put("status", old != null && "saved".equals(old.optString("status")) ? "saved" : "available");
    if (old != null && old.has("uri")) v.put("uri", old.optString("uri"));
    if (old != null) v.put("pinned", old.optBoolean("pinned") ? 1 : 0);
    getWritableDatabase().insertWithOnConflict("inbox", null, v, SQLiteDatabase.CONFLICT_REPLACE);
  }

  void clear() {
    getWritableDatabase().delete("inbox", "server=?", new String[] {srv});
    getWritableDatabase().delete("outbox", "server=?", new String[] {srv});
    getWritableDatabase().delete("outfiles", "server=?", new String[] {srv});
  }

  void clearServer(String serverId) {
    String[] a = new String[] {serverId};
    getWritableDatabase().delete("inbox", "server=?", a);
    getWritableDatabase().delete("outbox", "server=?", a);
    getWritableDatabase().delete("outfiles", "server=?", a);
  }
}
