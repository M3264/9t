package xyz.kennyy.ninet;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import java.util.List;
import org.json.JSONObject;

// Home-screen widget: latest inbox item plus pending counts. Tapping opens the inbox.
public final class NineTWidget extends AppWidgetProvider {
  static void refresh(Context c) {
    try {
      AppWidgetManager manager = AppWidgetManager.getInstance(c);
      int[] ids =
          manager.getAppWidgetIds(new ComponentName(c, NineTWidget.class));
      if (ids.length == 0) return;
      String title = "9t inbox", body = "Nothing received yet.";
      try (LocalStore db = new LocalStore(c)) {
        List<JSONObject> items = db.items(null);
        if (!items.isEmpty()) {
          JSONObject top = items.get(0);
          title = top.optString("name", "9t inbox");
          body =
              top.optString(
                  "content", top.optString("url", top.optString("type", "")));
          if (body.length() > 160) body = body.substring(0, 160) + "…";
        }
        int waiting = db.outbox().size() + db.outfiles().size();
        if (waiting > 0) title = title + " · " + waiting + " to send";
      } catch (Exception ignored) {}
      Intent open =
          new Intent(c, MainActivity.class)
              .setAction("xyz.kennyy.ninet.INBOX")
              .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
      PendingIntent pi =
          PendingIntent.getActivity(
              c, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
      for (int id : ids) {
        RemoteViews views = new RemoteViews(c.getPackageName(), R.layout.widget);
        views.setTextViewText(R.id.widget_title, title);
        views.setTextViewText(R.id.widget_body, body);
        views.setOnClickPendingIntent(R.id.widget_title, pi);
        views.setOnClickPendingIntent(R.id.widget_body, pi);
        manager.updateAppWidget(id, views);
      }
    } catch (Exception ignored) {}
  }

  @Override
  public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
    refresh(c);
  }

  @Override
  public void onReceive(Context c, Intent intent) {
    super.onReceive(c, intent);
    if ("xyz.kennyy.ninet.SYNCED".equals(intent.getAction())) refresh(c);
  }
}
