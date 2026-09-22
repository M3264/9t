package xyz.kennyy.ninet;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.Build;

final class Notices {
  private static Notification.Builder builder(Context c, String channel) {
    return Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, channel) : new Notification.Builder(c);
  }

  static void channels(Context c) {
    if (Build.VERSION.SDK_INT < 26) return;
    NotificationManager n = androidx.core.content.ContextCompat.getSystemService(c, NotificationManager.class);
    n.createNotificationChannel(
        new NotificationChannel("connection", "Connection", NotificationManager.IMPORTANCE_LOW));
    n.createNotificationChannel(
        new NotificationChannel(
            "transfers", "Received items", NotificationManager.IMPORTANCE_DEFAULT));
  }

  static PendingIntent home(Context c) {
    return PendingIntent.getActivity(
        c,
        0,
        new Intent(c, MainActivity.class),
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  static Notification live(Context c, String text) {
    channels(c);
    PendingIntent stop =
        PendingIntent.getService(
            c,
            1,
            new Intent(c, ReceiveService.class).setAction("pause"),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    PendingIntent sync =
        PendingIntent.getService(
            c,
            2,
            new Intent(c, ReceiveService.class).setAction("sync"),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    // RemoteInput requires a mutable PendingIntent on API 31+.
    PendingIntent send =
        PendingIntent.getService(
            c,
            3,
            new Intent(c, ReceiveService.class).setAction("send"),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
    long lastConnection = new Prefs(c).p.getLong("lastNetworkAt", 0);
    Notification.Builder notification =
        builder(c, "connection")
            .setSmallIcon(R.drawable.ic_ninet)
            .setContentTitle("9t · Live receiving")
            .setContentText(text)
            .setContentIntent(home(c))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setWhen(lastConnection)
            .setShowWhen(lastConnection > 0)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .addAction(new Notification.Action.Builder(R.drawable.ic_ninet, "Sync now", sync).build())
            .addAction(
                new Notification.Action.Builder(R.drawable.ic_ninet, "Send", send)
                    .addRemoteInput(
                        new RemoteInput.Builder("text").setLabel("Send text to 9t…").build())
                    .setAllowGeneratedReplies(false)
                    .build())
            .addAction(new Notification.Action.Builder(R.drawable.ic_ninet, "Pause", stop).build());
    if (Build.VERSION.SDK_INT >= 31)
      notification.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
    return notification.build();
  }

  static void clip(Context c) {
    channels(c);
    androidx.core.content.ContextCompat.getSystemService(c, NotificationManager.class)
        .notify(
            3,
            builder(c, "transfers")
                .setSmallIcon(R.drawable.ic_ninet)
                .setOnlyAlertOnce(true)
                .setContentTitle("Text received in 9t")
                .setContentText("Unlock and open 9t to copy it")
                .setContentIntent(home(c))
                .setAutoCancel(true)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .build());
  }

  static void arrived(Context c, int count, String latest) {
    channels(c);
    String text = count == 1 ? latest : count + " new items · latest: " + latest;
    androidx.core.content.ContextCompat.getSystemService(c, NotificationManager.class)
        .notify(
            4,
            builder(c, "transfers")
                .setSmallIcon(R.drawable.ic_ninet)
                .setContentTitle(count == 1 ? "New in 9t" : count + " new in 9t")
                .setContentText(text)
                .setContentIntent(home(c))
                .setAutoCancel(true)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .build());
  }

  static void saved(Context c, String name, Uri uri, String mime) {    channels(c);
    Intent open =
        new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, mime)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    PendingIntent pi =
        PendingIntent.getActivity(
            c,
            uri.hashCode(),
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    androidx.core.content.ContextCompat.getSystemService(c, NotificationManager.class)
        .notify(
            uri.hashCode(),
            builder(c, "transfers")
                .setSmallIcon(R.drawable.ic_ninet)
                .setContentTitle("Saved to Downloads/9t")
                .setContentText(name)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .build());
  }
}
