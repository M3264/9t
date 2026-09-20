package xyz.kennyy.ninet;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;
import androidx.annotation.RequiresApi;

// Quick Settings tile: jump straight to the Send composer.
@RequiresApi(api = Build.VERSION_CODES.N)
public final class SendTile extends TileService {
  @Override
  public void onStartListening() {
    Tile tile = getQsTile();
    if (tile == null) return;
    boolean paired = false;
    try {
      paired = new Prefs(this).paired();
    } catch (Exception ignored) {}
    tile.setState(paired ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
    tile.updateTile();
  }

  @Override
  @SuppressLint("StartActivityAndCollapseDeprecated") // PendingIntent variant needs API 34.
  public void onClick() {
    Intent open =
        new Intent(this, MainActivity.class)
            .setAction("xyz.kennyy.ninet.SEND")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      unlockAndRun(() -> startActivityAndCollapse(open));
    } else {
      startActivity(open);
    }
  }
}
