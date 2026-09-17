package xyz.kennyy.ninet;

import android.app.*;
import android.content.*;
import android.net.Uri;

final class Notices {
  static void channels(Context c) {
    NotificationManager n = c.getSystemService(NotificationManager.class);
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
    return new Notification.Builder(c, "connection")
        .setSmallIcon(R.drawable.ic_ninet)
        .setContentTitle("9t · Live receiving")
        .setContentText(text)
        .setContentIntent(home(c))
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setVisibility(Notification.VISIBILITY_PRIVATE)
        .addAction(new Notification.Action.Builder(null, "Pause", stop).build())
        .build();
  }

  static void clip(Context c) {
    channels(c);
    c.getSystemService(NotificationManager.class)
        .notify(
            3,
            new Notification.Builder(c, "transfers")
                .setSmallIcon(R.drawable.ic_ninet)
                .setOnlyAlertOnce(true)
                .setContentTitle("Text received in 9t")
                .setContentText("Unlock and open 9t to copy it")
                .setContentIntent(home(c))
                .setAutoCancel(true)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .build());
  }

  static void saved(Context c, String name, Uri uri, String mime) {
    channels(c);
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
    c.getSystemService(NotificationManager.class)
        .notify(
            uri.hashCode(),
            new Notification.Builder(c, "transfers")
                .setSmallIcon(R.drawable.ic_ninet)
                .setContentTitle("Saved to Downloads/9t")
                .setContentText(name)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .build());
  }
}
