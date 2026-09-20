package xyz.kennyy.ninet;

import android.content.*;
import android.database.Cursor;
import android.database.sqlite.*;
import java.util.*;
import org.json.*;

final class LocalStore extends SQLiteOpenHelper {
  LocalStore(Context c) {
    super(c, "9t.db", null, 2);
  }

  public void onCreate(SQLiteDatabase db) {
    db.execSQL(
        "CREATE TABLE inbox (id TEXT PRIMARY KEY, revision TEXT NOT NULL, metadata TEXT NOT NULL,"
            + " status TEXT NOT NULL DEFAULT 'pending', uri TEXT, content TEXT, error TEXT,"
            + " pinned INTEGER NOT NULL DEFAULT 0)");
    db.execSQL("CREATE TABLE outbox (id TEXT PRIMARY KEY, content TEXT NOT NULL, error TEXT,"
        + " kind TEXT NOT NULL DEFAULT 'snippet', name TEXT)");
    db.execSQL("CREATE TABLE outfiles (id TEXT PRIMARY KEY, uri TEXT NOT NULL, name TEXT NOT NULL,"
        + " mime TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0, offset INTEGER NOT NULL DEFAULT 0,"
        + " error TEXT)");
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
  }

  boolean discover(JSONObject o, long since) throws Exception {
    String id = o.getString("id"), rev = o.getString("updatedAt");
    JSONObject old = find(id);
    if (old != null && rev.equals(old.optString("revision"))) return false;
    ContentValues v = new ContentValues();
    v.put("id", id);
    v.put("revision", rev);
    v.put("metadata", o.toString());
    boolean before = java.time.Instant.parse(o.getString("createdAt")).toEpochMilli() < since;
    v.put("status", before ? "available" : "pending");
    // Already downloaded files need no new copy for rename/pin-only edits.
    if (old != null
        && o.getString("type").equals("file")
        && !old.optString("status").equals("available")) {
      v.put("status", old.optString("status"));
      if (old.has("uri")) v.put("uri", old.optString("uri"));
    }
    getWritableDatabase().insertWithOnConflict("inbox", null, v, SQLiteDatabase.CONFLICT_REPLACE);
    return true;
  }

  JSONObject find(String id) throws Exception {
    try (Cursor c =
        getReadableDatabase().query("inbox", null, "id=?", new String[] {id}, null, null, null)) {
      return c.moveToFirst() ? row(c) : null;
    }
  }

  List<JSONObject> items(String where) throws Exception {
    List<JSONObject> list = new ArrayList<>();
    try (Cursor c =
        getReadableDatabase().query("inbox", null, where, null, null, null, "pinned DESC, revision DESC")) {
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
    getWritableDatabase().update("inbox", v, "id=?", new String[] {id});
  }

  void setPinned(String id, boolean pinned) {
    ContentValues v = new ContentValues();
    v.put("pinned", pinned ? 1 : 0);
    getWritableDatabase().update("inbox", v, "id=?", new String[] {id});
  }

  void remove(String id) {
    getWritableDatabase().delete("inbox", "id=?", new String[] {id});
  }

  void clearInbox() {
    getWritableDatabase().delete("inbox", null, null);
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
    if (name != null) v.put("name", name);
    getWritableDatabase().insertOrThrow("outbox", null, v);
    return id;
  }

  List<JSONObject> outbox() throws Exception {
    List<JSONObject> list = new ArrayList<>();
    try (Cursor c = getReadableDatabase().rawQuery("SELECT id,content,error,kind,name FROM outbox", null)) {
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
    getWritableDatabase().delete("outbox", "id=?", new String[] {id});
  }

  void outError(String id, String error) {
    ContentValues v = new ContentValues();
    v.put("error", error);
    getWritableDatabase().update("outbox", v, "id=?", new String[] {id});
  }

  void stageFile(String id, String uri, String name, String mime, long size) {
    ContentValues v = new ContentValues();
    v.put("id", id);
    v.put("uri", uri);
    v.put("name", name);
    v.put("mime", mime);
    v.put("size", size);
    v.put("offset", 0);
    getWritableDatabase().insertOrThrow("outfiles", null, v);
  }

  List<JSONObject> outfiles() throws Exception {
    List<JSONObject> list = new ArrayList<>();
    try (Cursor c = getReadableDatabase().rawQuery(
        "SELECT id,uri,name,mime,size,offset,error FROM outfiles", null)) {
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
    getWritableDatabase().update("outfiles", v, "id=?", new String[] {id});
  }

  void fileError(String id, String error) {
    ContentValues v = new ContentValues();
    v.put("error", error);
    getWritableDatabase().update("outfiles", v, "id=?", new String[] {id});
  }

  void fileSent(String id) {
    getWritableDatabase().delete("outfiles", "id=?", new String[] {id});
  }

  void clear() {
    getWritableDatabase().delete("inbox", null, null);
    getWritableDatabase().delete("outbox", null, null);
    getWritableDatabase().delete("outfiles", null, null);
  }
}
