package xyz.kennyy.ninet;

import android.graphics.*;
import android.graphics.drawable.Drawable;
import androidx.core.graphics.PathParser;

/** Small, resolution-independent drawings shared by the native screens. */
final class PocketArt extends Drawable {
  private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final String name;
  private final int color;
  private final float density;

  PocketArt(String name, int color, float density) {
    this.name = name;
    this.color = color;
    this.density = density;
  }

  @Override public void draw(Canvas canvas) {
    canvas.save();
    canvas.translate(getBounds().left, getBounds().top);
    paint.setColor(color);
    if (name.equals("paper")) {
      paint.setStyle(Paint.Style.FILL);
      paint.setAlpha(36);
      float step = 20 * density;
      for (float x = step / 2; x < getBounds().width(); x += step)
        for (float y = step / 2; y < getBounds().height(); y += step)
          canvas.drawCircle(x, y, density * .65f, paint);
    } else {
      canvas.scale(getBounds().width() / 24f, getBounds().height() / 24f);
      paint.setStyle(Paint.Style.STROKE);
      paint.setStrokeWidth(1.7f);
      paint.setStrokeCap(Paint.Cap.ROUND);
      paint.setStrokeJoin(Paint.Join.ROUND);
      String path;
      switch (name) {
        case "Inbox": path = "M4 4H20L22 14V20H2V14Z M2 14H8L10 17H14L16 14H22"; break;
        case "Workspace": path = "M3 3H10V10H3Z M14 3H21V10H14Z M3 14H10V21H3Z M14 14H21V21H14Z"; break;
        case "Send": path = "M21 3L14 21L10 14L3 10Z M10 14L21 3"; break;
        case "Connect": path = "M8 3H16Q18 3 18 5V19Q18 21 16 21H8Q6 21 6 19V5Q6 3 8 3Z M10 6H14 M11 18H13"; break;
        case "search": path = "M19 19L22 22 M18 10A8 8 0 1 1 2 10A8 8 0 1 1 18 10"; break;
        case "refresh": path = "M20 10A8 8 0 1 0 19 17 M20 4V10H14"; break;
        case "file": path = "M5 2H14L20 8V22H5Z M14 2V8H20 M9 13H16 M9 17H14"; break;
        case "snippet": path = "M8 7L3 12L8 17 M16 7L21 12L16 17 M14 4L10 20"; break;
        case "link": path = "M10 14L14 10 M9 7L12 4A5 5 0 0 1 20 12L17 15 M7 9L4 12A5 5 0 0 0 12 20L15 17"; break;
        case "copy": path = "M9 8H21V21H9Z M15 8V3H3V16H9"; break;
        case "download": path = "M12 3V16 M7 11L12 16L17 11 M3 17V21H21V17"; break;
        case "pause": path = "M7 4V20 M17 4V20"; break;
        case "check": path = "M4 12L9 17L20 6"; break;
        case "close": path = "M6 6L18 18 M18 6L6 18"; break;
        case "moon": path = "M20 15A9 9 0 0 1 9 3A8 8 0 1 0 20 15Z"; break;
        case "shield": path = "M12 2L21 6V12Q21 18 12 22Q3 18 3 12V6Z M8 12L11 15L16 9"; break;
        case "chevron": path = "M9 5L16 12L9 19"; break;
        default: path = "M5 12H19 M13 6L19 12L13 18";
      }
      canvas.drawPath(PathParser.createPathFromPathData(path), paint);
    }
    canvas.restore();
  }
  @Override public void setAlpha(int alpha) { paint.setAlpha(alpha); }
  @Override public void setColorFilter(ColorFilter filter) { paint.setColorFilter(filter); }
  @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
}
