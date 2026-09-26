package xyz.kennyy.ninet;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import java.util.*;
import java.util.concurrent.*;
import okhttp3.*;
import org.json.*;

public final class MainActivity extends Activity {
  // Muted lavender — shared with the web workspace.
  private int bg, paper, ink, accent, muted, accentSoft, accentInk, onAccent, lineInk;
  private LinearLayout shell, body, nav;
  private Typeface regularFont, boldFont;
  private String inboxFilter = "all", inboxQuery = "", composeDraft = "";
  private LinearLayout inboxItems;
  private final Set<String> openSettings = new HashSet<>();
  private TextView connection;
  private TextView receiverStatus, batteryStatus;
  private Prefs prefs;
  private String tab = "Inbox";
  private WebView web;
  private boolean pairingNew;
  private String pairingReturnTo;
  private String webOrigin = "";
  private ValueCallback<Uri[]> chooser;
  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private final Handler handler = new Handler(Looper.getMainLooper());
  private boolean foreground;
  private long renderedVersion;
  private long webRetryAt;
  private final Runnable refresh =
      new Runnable() {
        public void run() {
          if (!foreground) return;
          updateStatus();
          SyncEngine.copyPending(MainActivity.this);
          handler.postDelayed(this, 2500);
        }
      };

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    prefs = new Prefs(this);
    prefs.ensureProfiles();
    regularFont = Typeface.createFromAsset(getAssets(), "fonts/SpaceGrotesk-Regular.ttf");
    boldFont = Typeface.createFromAsset(getAssets(), "fonts/SpaceGrotesk-Bold.ttf");
    applyTheme();
    if (state != null) {
      tab = state.getString("tab", "Inbox");
      composeDraft = state.getString("composeDraft", "");
      inboxQuery = state.getString("inboxQuery", "");
      inboxFilter = state.getString("inboxFilter", "all");
      ArrayList<String> expanded = state.getStringArrayList("openSettings");
      if (expanded != null) openSettings.addAll(expanded);
    }
    Notices.channels(this);
    getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    render();
    handleSend(getIntent());
  }

  @Override
  protected void onSaveInstanceState(Bundle state) {
    state.putString("tab", tab);
    state.putString("composeDraft", composeDraft);
    state.putString("inboxQuery", inboxQuery);
    state.putString("inboxFilter", inboxFilter);
    state.putStringArrayList("openSettings", new ArrayList<>(openSettings));
    super.onSaveInstanceState(state);
  }

  @Override
  protected void onResume() {
    super.onResume();
    foreground = true;
    ReceiverDiagnostics.visibility(this, true);
    handler.post(refresh);
    if (prefs.paired() && prefs.p.getBoolean("enabled", true)) {
      ensureLive();
      sync(false);
      offerBackgroundAccess();
    }
    if (!prefs.paired() && !pairPolling && pendingPairReq() != null) render();
    gateIfLocked();
  }

  @Override
  protected void onPause() {
    foreground = false;
    backgroundedAt = System.currentTimeMillis();
    ReceiverDiagnostics.visibility(this, false);
    handler.removeCallbacks(refresh);
    super.onPause();
  }

  private static boolean unlockedThisRun = false;
  private long backgroundedAt;

  private interface PinCallback {
    void onPin(String pin);
  }

  private void pinPrompt(String title, String buttonLabel, PinCallback done) {
    EditText input = plainField("PIN · 4+ digits");
    input.setInputType(android.text.InputType.TYPE_CLASS_NUMBER
        | android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD);
    AlertDialog dialog = new PocketDialog()
        .setTitle(title)
        .setView(input)
        .setPositiveButton(buttonLabel, null)
        .setNegativeButton("Cancel", null)
        .create();
    dialog.setOnShowListener(
        shown ->
            dialog
                .getButton(AlertDialog.BUTTON_POSITIVE)
                .setOnClickListener(
                    v -> {
                      String pin = input.getText().toString();
                      if (pin.length() < 4) {
                        toast("Use at least 4 digits.");
                        return;
                      }
                      dialog.dismiss();
                      done.onPin(pin);
                    }));
    dialog.show();
  }

  private void pinSet() {
    final String[] first = new String[1];
    pinPrompt("Choose a PIN", "Next", pin -> {
      first[0] = pin;
      pinPrompt("Confirm PIN", "Save", confirm -> {
        if (!confirm.equals(first[0])) {
          toast("PINs did not match.");
          return;
        }
        savePin(confirm);
        unlockedThisRun = true;
        toast("App PIN set");
        render();
      });
    });
  }

  private void pinChange() {
    pinPrompt("Current PIN", "Next", current -> {
      if (!checkPin(current)) {
        toast("Wrong PIN");
        return;
      }
      pinSet();
    });
  }

  private void pinRemove() {
    pinPrompt("Current PIN", "Remove", current -> {
      if (!checkPin(current)) {
        toast("Wrong PIN");
        return;
      }
      prefs.p.edit().remove("pinHash").remove("pinSalt").apply();
      unlockedThisRun = true;
      toast("App PIN removed");
      render();
    });
  }

  private void gateIfLocked() {
    if (!prefs.p.contains("pinHash")) {
      unlockedThisRun = true;
      return;
    }
    if (unlockedThisRun && System.currentTimeMillis() - backgroundedAt < 120000) return;
    unlockedThisRun = false;
    EditText pin = plainField("PIN");
    pin.setInputType(android.text.InputType.TYPE_CLASS_NUMBER
        | android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD);
    AlertDialog dialog =
        new PocketDialog()
            .setTitle("9t is locked")
            .setView(pin)
            .setCancelable(false)
            .setPositiveButton("Unlock", null)
            .create();
    dialog.setOnShowListener(
        shown -> {
          dialog
              .getButton(AlertDialog.BUTTON_POSITIVE)
              .setOnClickListener(
                  v -> {
                    if (checkPin(pin.getText().toString())) {
                      unlockedThisRun = true;
                      dialog.dismiss();
                    } else {
                      pin.setText("");
                      toast("Wrong PIN");
                    }
                  });
        });
    dialog.show();
  }

  private boolean checkPin(String pin) {
    try {
      String salt = prefs.p.getString("pinSalt", ""),
          expected = prefs.p.getString("pinHash", "");
      java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
      byte[] hash = digest.digest((salt + ":" + pin).getBytes(java.nio.charset.StandardCharsets.UTF_8));
      StringBuilder hex = new StringBuilder();
      for (byte b : hash) hex.append(String.format(java.util.Locale.ROOT, "%02x", b));
      return !expected.isEmpty() && hex.toString().equals(expected);
    } catch (Exception e) {
      return false;
    }
  }

  private void savePin(String pin) {
    byte[] salt = new byte[16];
    new java.security.SecureRandom().nextBytes(salt);
    String saltB64 = android.util.Base64.encodeToString(salt, android.util.Base64.NO_WRAP);
    try {
      java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
      byte[] hash = digest.digest(
          (saltB64 + ":" + pin).getBytes(java.nio.charset.StandardCharsets.UTF_8));
      StringBuilder hex = new StringBuilder();
      for (byte b : hash) hex.append(String.format(java.util.Locale.ROOT, "%02x", b));
      prefs.p.edit().putString("pinSalt", saltB64).putString("pinHash", hex.toString()).apply();
    } catch (Exception e) {
      toast("Could not save PIN");
    }
  }

  @Override
  protected void onDestroy() {
    io.shutdownNow();
    if (web != null) web.destroy();
    if (chooser != null) chooser.onReceiveValue(null);
    super.onDestroy();
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    handleSend(intent);
  }

  private void handleSend(Intent intent) {
    if (intent == null) return;
    String action = intent.getAction();
    if (Intent.ACTION_PROCESS_TEXT.equals(action)) {
      // Text-selection toolbar → "Send to 9t". Read-only: never replace the selection.
      CharSequence selected = intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT);
      intent.setAction(null);
      if (selected == null || selected.toString().trim().isEmpty()) return;
      if (!prefs.paired()) {
        toast("Pair your workspace, then select the text again.");
        return;
      }
      String text = selected.toString();
      tab = "Send";
      render();
      EditText input = body.findViewWithTag("compose");
      if (input != null) input.setText(text);
      toast("Text ready — tap Send to 9t");
      return;
    }
    if ("xyz.kennyy.ninet.SEND".equals(action)) {
      tab = "Send";
      render();
      intent.setAction(null);
      return;
    }
    if ("xyz.kennyy.ninet.INBOX".equals(action)) {
      tab = "Inbox";
      render();
      intent.setAction(null);
      return;
    }
    if (Intent.ACTION_SEND.equals(action)) {
      if (intent.getStringExtra(Intent.EXTRA_TEXT) != null) {
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        intent.setAction(null);
        if (!prefs.paired()) {
          toast("Pair your workspace, then share the text again.");
          return;
        }
        tab = "Send";
        render();
        EditText input = body.findViewWithTag("compose");
        if (input != null) input.setText(text);
        return;
      }
      android.net.Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
      intent.setAction(null);
      if (stream != null) {
        if (!prefs.paired()) {
          toast("Pair your workspace, then share the file again.");
          return;
        }
        tab = "Send";
        render();
        stageSharedFile(stream);
      }
      return;
    }
    if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
      java.util.ArrayList<android.net.Uri> streams =
          intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
      intent.setAction(null);
      if (streams == null || streams.isEmpty()) return;
      if (!prefs.paired()) {
        toast("Pair your workspace, then share the files again.");
        return;
      }
      tab = "Send";
      render();
      for (android.net.Uri stream : streams) stageSharedFile(stream);
    }
  }

  private void stageSharedFile(android.net.Uri stream) {
    try {
      getContentResolver().takePersistableUriPermission(
          stream, Intent.FLAG_GRANT_READ_URI_PERMISSION);
    } catch (Exception ignored) {}
    String name = "shared-file", mime = getContentResolver().getType(stream);
    if (mime == null) mime = "application/octet-stream";
    long size = 0;
    try (android.database.Cursor cursor = getContentResolver().query(
        stream, new String[] {android.provider.OpenableColumns.DISPLAY_NAME,
            android.provider.OpenableColumns.SIZE}, null, null, null)) {
      if (cursor != null && cursor.moveToFirst()) {
        String display = cursor.getString(0);
        if (display != null && !display.trim().isEmpty()) name = display;
        try {
          size = Math.max(0, cursor.getLong(1));
        } catch (Exception ignored) {}
      }
    } catch (Exception ignored) {}
    try (LocalStore db = new LocalStore(this)) {
      db.stageFile(
          java.util.UUID.randomUUID().toString(), stream.toString(), name, mime, size);
    } catch (Exception e) {
      toast("Could not queue that file.");
      return;
    }
    toast("File queued — it uploads on the next sync");
    render();
    sync(true);
  }

  private int dp(int n) {
    return Math.round(n * getResources().getDisplayMetrics().density);
  }

  private void applyTheme() {
    boolean dark = prefs != null && prefs.p.getBoolean("darkTheme", false);
    bg = Color.parseColor(dark ? "#19171e" : "#f7f6f9");
    paper = Color.parseColor(dark ? "#23202a" : "#ffffff");
    ink = Color.parseColor(dark ? "#f0ecf5" : "#292532");
    accent = Color.parseColor(dark ? "#c0acd9" : "#786294");
    accentInk = Color.parseColor(dark ? "#d5c5e9" : "#604c7c");
    onAccent = Color.parseColor(dark ? "#251c30" : "#ffffff");
    muted = Color.parseColor(dark ? "#b0a7bc" : "#736d7d");
    accentSoft = Color.parseColor(dark ? "#383044" : "#eee8f6");
    lineInk = Color.parseColor(dark ? "#393341" : "#e7e2ed");
    getWindow().setStatusBarColor(Build.VERSION.SDK_INT >= 23 ? bg : Color.parseColor("#292532"));
    getWindow().setNavigationBarColor(Build.VERSION.SDK_INT >= 26 ? bg : Color.parseColor("#292532"));
    int flags = 0;
    if (!dark && Build.VERSION.SDK_INT >= 23) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
    if (!dark && Build.VERSION.SDK_INT >= 26) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
    getWindow().getDecorView().setSystemUiVisibility(flags);
  }

  private GradientDrawable shape(int color, int radius) {
    GradientDrawable d = new GradientDrawable();
    d.setColor(color);
    d.setCornerRadius(dp(radius));
    return d;
  }

  private GradientDrawable sticker(int color, int radius) {
    GradientDrawable d = new GradientDrawable();
    d.setColor(color);
    d.setCornerRadius(dp(radius));
    d.setStroke(dp(2), lineInk);
    return d;
  }

  private TextView text(String value, int size, int color) {
    TextView v = new TextView(this);
    v.setText(value);
    v.setIncludeFontPadding(false);
    v.setTextSize(size);
    v.setTextColor(color);
    v.setTypeface(regularFont);
    v.setPadding(0, dp(6), 0, dp(6));
    return v;
  }

  private TextView title(String value) {
    TextView t = text(value, 36, ink);
    t.setTypeface(boldFont);
    body.addView(t);
    return t;
  }

  private void paragraph(String value) {
    TextView t = text(value, 15, muted);
    t.setLineSpacing(dp(3), 1);
    body.addView(t);
  }

  private void eyebrow(String value) {
    TextView b = text(value, 10, accentInk);
    b.setTypeface(boldFont);
    GradientDrawable d = new GradientDrawable();
    d.setColor(accentSoft);
    d.setCornerRadius(dp(20));
    d.setStroke(dp(2), lineInk);
    b.setBackground(d);
    b.setPadding(dp(12), dp(7), dp(12), dp(7));
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-2, -2);
    p.setMargins(0, 0, 0, dp(8));
    body.addView(b, p);
  }

  private void hero(String tag, String headline, String sub) {
    eyebrow(tag);
    title(headline);
    paragraph(sub);
  }

  private void sectionLabel(String value) {
    TextView t = text(value, 11, muted);
    t.setTypeface(boldFont);
    t.setPadding(0, dp(16), 0, dp(2));
    body.addView(t);
  }

  private LinearLayout card() {
    LinearLayout c = new LinearLayout(this);
    c.setOrientation(LinearLayout.VERTICAL);
    c.setPadding(dp(16), dp(14), dp(16), dp(14));
    c.setBackground(sticker(paper, 16));
    c.setElevation(dp(3));
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
    p.setMargins(0, dp(7), 0, dp(7));
    body.addView(c, p);
    return c;
  }

  private void paragraphIn(LinearLayout parent, String value) {
    TextView t = text(value, 14, muted);
    t.setLineSpacing(dp(3), 1);
    parent.addView(t);
  }

  private TextView labelIn(LinearLayout parent, String value) {
    TextView t = text(value, 11, muted);
    t.setTypeface(boldFont);
    t.setPadding(0, dp(10), 0, 0);
    parent.addView(t);
    return t;
  }

  private EditText fieldIn(LinearLayout parent, String hint, String value, boolean multiline) {
    EditText e = new EditText(this);
    e.setTextColor(ink);
    e.setHintTextColor(muted);
    e.setHint(hint);
    e.setText(value);
    e.setTextSize(15);
    e.setTypeface(regularFont);
    e.setPadding(dp(14), dp(12), dp(14), dp(12));
    e.setBackground(sticker(paper, 14));
    e.setSingleLine(!multiline);
    if (multiline) {
      e.setMinLines(4);
      e.setGravity(Gravity.TOP);
      e.setInputType(
          android.text.InputType.TYPE_CLASS_TEXT
              | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE);
    }
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
    p.setMargins(0, dp(6), 0, dp(6));
    parent.addView(e, p);
    return e;
  }

  private void toggleIn(LinearLayout parent, String label, String key, boolean fallback) {
    Switch sw = new Switch(this);
    sw.setText(label);
    sw.setTextColor(ink);
    styleSwitch(sw);
    sw.setPadding(0, dp(10), 0, dp(10));
    sw.setChecked(prefs.p.getBoolean(key, fallback));
    sw.setOnCheckedChangeListener((b, value) -> prefs.p.edit().putBoolean(key, value).apply());
    parent.addView(sw);
  }

  private PocketArt icon(String name, int color, int size) {
    PocketArt d = new PocketArt(name, color, getResources().getDisplayMetrics().density);
    d.setBounds(0, 0, dp(size), dp(size));
    return d;
  }

  private String actionIcon(String label) {
    String l = label.toLowerCase(Locale.ROOT);
    if (l.equals("more")) return "more";
    if (l.contains("paste") || l.contains("copy")) return "copy";
    if (l.contains("pause")) return "pause";
    if (l.contains("refresh") || l.contains("again")) return "refresh";
    if (l.contains("remove") || l.contains("disconnect")) return "close";
    if (l.contains("save")) return "check";
    if (l.contains("send")) return "Send";
    if (l.contains("download") || l.contains("receive")) return "download";
    if (l.contains("background")) return "shield";
    if (l.contains("connection") || l.contains("phone")) return "Connect";
    return "arrow";
  }

  private android.graphics.drawable.Drawable touchSurface(int color, int radius) {
    return new android.graphics.drawable.RippleDrawable(
        android.content.res.ColorStateList.valueOf(0x25786294), sticker(color, radius), null);
  }

  private void styleSwitch(Switch sw) {
    sw.setTypeface(regularFont);
    sw.setTextSize(14);
    sw.setMinHeight(dp(56));
    sw.setSwitchPadding(dp(16));
    if (sw.getThumbDrawable() != null) sw.getThumbDrawable().mutate().setTintList(new android.content.res.ColorStateList(
        new int[][] {new int[] {android.R.attr.state_checked}, new int[] {}},
        new int[] {accent, muted}));
    if (sw.getTrackDrawable() != null) sw.getTrackDrawable().mutate().setTintList(new android.content.res.ColorStateList(
        new int[][] {new int[] {android.R.attr.state_checked}, new int[] {}},
        new int[] {accentSoft, bg}));
  }

  private Button action(String label, boolean primary, Runnable run) {
    Button b = new Button(this);
    b.setText(label);
    b.setAllCaps(false);
    int foreground = primary ? onAccent : ink;
    b.setTextColor(foreground);
    b.setTextSize(14);
    b.setTypeface(boldFont);
    b.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
    b.setPadding(dp(16), dp(10), dp(16), dp(10));
    b.setCompoundDrawables(icon(actionIcon(label), foreground, 20), null, null, null);
    b.setCompoundDrawablePadding(dp(12));
    b.setBackground(touchSurface(primary ? accent : paper, 12));
    b.setMinHeight(dp(52));
    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
    lp.setMargins(0, dp(6), 0, dp(6));
    b.setLayoutParams(lp);
    b.setOnClickListener(v -> run.run());
    return b;
  }

  private Button secondary(String label, Runnable run) { return action(label, false, run); }
  private Button button(String label, Runnable run) { return action(label, true, run); }

  private LinearLayout disclosure(String label, String symbol, String subtitle) {
    LinearLayout outer = card();
    TextView heading = text(label, 16, ink);
    heading.setTypeface(boldFont);
    heading.setMinHeight(dp(56));
    heading.setGravity(Gravity.CENTER_VERTICAL);
    heading.setCompoundDrawables(icon(symbol, ink, 22), null,
        icon(openSettings.contains(label) ? "close" : "chevron", muted, 18), null);
    heading.setCompoundDrawablePadding(dp(12));
    heading.setContentDescription(label + ", " + (openSettings.contains(label) ? "expanded" : "collapsed"));
    outer.addView(heading);
    TextView summary = text(subtitle, 12, muted);
    outer.addView(summary);
    LinearLayout detail = new LinearLayout(this);
    detail.setOrientation(LinearLayout.VERTICAL);
    detail.setVisibility(openSettings.contains(label) ? View.VISIBLE : View.GONE);
    outer.addView(detail);
    heading.setBackground(new android.graphics.drawable.RippleDrawable(
        android.content.res.ColorStateList.valueOf(0x22786294), null, shape(paper, 8)));
    heading.setOnClickListener(v -> {
      boolean opening = detail.getVisibility() != View.VISIBLE;
      detail.setVisibility(opening ? View.VISIBLE : View.GONE);
      if (opening) openSettings.add(label); else openSettings.remove(label);
      heading.setCompoundDrawables(icon(symbol, ink, 22), null, icon(opening ? "close" : "chevron", muted, 18), null);
      heading.setContentDescription(label + (opening ? ", expanded" : ", collapsed"));
    });
    return detail;
  }

  private EditText plainField(String hint) {
    EditText e = new EditText(this);
    e.setTextColor(ink);
    e.setHintTextColor(muted);
    e.setHint(hint);
    e.setTextSize(15);
    e.setTypeface(regularFont);
    e.setPadding(dp(14), dp(12), dp(14), dp(12));
    e.setBackground(sticker(paper, 14));
    e.setSingleLine(true);
    return e;
  }

  private EditText field(String hint, String value, boolean multiline) {
    EditText e = new EditText(this);
    e.setTextColor(ink);
    e.setHintTextColor(muted);
    e.setHint(hint);
    e.setText(value);
    e.setTextSize(15);
    e.setTypeface(regularFont);
    e.setPadding(dp(14), dp(12), dp(14), dp(12));
    e.setBackground(sticker(paper, 14));
    e.setElevation(dp(2));
    e.setSingleLine(!multiline);
    if (multiline) {
      e.setMinLines(4);
      e.setGravity(Gravity.TOP);
      e.setInputType(
          android.text.InputType.TYPE_CLASS_TEXT
              | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE);
    }
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
    p.setMargins(0, dp(8), 0, dp(8));
    body.addView(e, p);
    return e;
  }

  private void render() {
    pairGen++;
    pairPolling = false;
    pairPollTask = null;
    receiverStatus = null;
    batteryStatus = null;
    renderedVersion = prefs.p.getLong("inboxVersion", 0);
    inboxItems = null;
    if (web != null) {
      web.destroy();
      web = null;
    }
    shell = new LinearLayout(this);
    shell.setOrientation(LinearLayout.VERTICAL);
    shell.setBackground(new android.graphics.drawable.LayerDrawable(
        new android.graphics.drawable.Drawable[] {new android.graphics.drawable.ColorDrawable(bg),
            new PocketArt("paper", muted, getResources().getDisplayMetrics().density)}));
    shell.setOnApplyWindowInsetsListener(
        (v, insets) -> {
          if (Build.VERSION.SDK_INT >= 30) {
            android.graphics.Insets bars =
                insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
          } else {
            v.setPadding(
                insets.getSystemWindowInsetLeft(),
                insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(),
                insets.getSystemWindowInsetBottom());
          }
          return insets;
        });
    setContentView(shell);
    LinearLayout header = new LinearLayout(this);
    header.setGravity(Gravity.CENTER_VERTICAL);
    header.setPadding(dp(16), dp(10), dp(16), dp(8));
    ImageView mark = new ImageView(this);
    mark.setImageResource(R.drawable.mark);
    mark.setContentDescription("9t");
    mark.setBackground(sticker(accentSoft, 12));
    mark.setPadding(dp(10), dp(6), dp(10), dp(6));
    mark.setElevation(dp(2));
    LinearLayout.LayoutParams markP = new LinearLayout.LayoutParams(dp(64), dp(46));
    markP.setMargins(0, 0, dp(8), 0);
    header.addView(mark, markP);
    connection = text("● POCKET CLOUD", 11, ink);
    connection.setTypeface(boldFont);
    connection.setBackground(sticker(paper, 20));
    connection.setPadding(dp(10), dp(6), dp(10), dp(6));
    connection.setGravity(Gravity.END);
    connection.setMaxLines(2);
    LinearLayout.LayoutParams connP = new LinearLayout.LayoutParams(0, -2, 1);
    connP.setMargins(dp(12), 0, 0, 0);
    header.addView(connection, connP);
    shell.addView(header);
    ScrollView scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    body = new LinearLayout(this);
    body.setOrientation(LinearLayout.VERTICAL);
    body.setPadding(dp(20), dp(12), dp(20), dp(24));
    scroll.addView(body);
    shell.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
    if (!prefs.paired() || pairingNew) {
      onboarding();
      return;
    }
    nav = new LinearLayout(this);
    nav.setPadding(dp(8), dp(8), dp(8), dp(8));
    nav.setBackground(sticker(paper, 20));
    nav.setElevation(dp(4));
    LinearLayout.LayoutParams navP = new LinearLayout.LayoutParams(-1, -2);
    navP.setMargins(dp(12), dp(4), dp(12), dp(12));
    for (String name : new String[] {"Inbox", "Workspace", "Send", "Connect"}) {
      boolean active = tab.equals(name);
      TextView b = text(name, 10, active ? accentInk : muted);
      b.setTypeface(boldFont);
      b.setGravity(Gravity.CENTER);
      b.setPadding(dp(2), dp(10), dp(2), dp(8));
      b.setCompoundDrawables(null, icon(name, active ? accentInk : muted, 23), null, null);
      b.setCompoundDrawablePadding(dp(5));
      b.setBackground(active ? touchSurface(accentSoft, 12) : shape(paper, 12));
      b.setSelected(active);
      b.setContentDescription(name + (active ? ", selected" : ""));
      nav.addView(b, new LinearLayout.LayoutParams(0, -2, 1));
      b.setMinHeight(dp(64));
      b.setOnClickListener(v -> { tab = name; render(); });
    }
    shell.addView(nav, navP);
    updateStatus();
    switch (tab) {
      case "Workspace":
        workspace(scroll);
        break;
      case "Send":
        send();
        break;
      case "Connect":
        settings();
        break;
      default:
        inbox();
    }
  }

  private void onboarding() {
    hero("LAN FIRST · ENCRYPTED · YOUR SERVER", "Drop it.\nBeam it.",
        "Your 9t stash lives here — files land in Downloads/9t, snippets are ready to paste.");
    sectionLabel("CONNECT YOUR WORKSPACE");
    paragraph(
        "In 9t, open Settings → Android devices & pairing. Create a code, then paste it below."
            + " Treat the code like a password.");
    EditText code = field("Paste your 9t pairing code", "", true);
    code.setInputType(
        android.text.InputType.TYPE_CLASS_TEXT
            | android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
            | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE);
    CheckBox existing = new CheckBox(this);
    existing.setText("Also receive existing items");
    existing.setTextColor(ink);
    existing.setTypeface(regularFont);
    existing.setButtonTintList(android.content.res.ColorStateList.valueOf(accent));
    body.addView(existing);
    paragraph(
        "New files save automatically to Downloads/9t. New snippets replace your clipboard when"
            + " receiving is active and the phone is unlocked. You can turn either off.");
    body.addView(
        button(
            "Pair this phone",
            () -> {
              try {
                prefs.pair(code.getText().toString());
                if (existing.isChecked()) prefs.p.edit().putLong("since", 0).commit();
                try (LocalStore db = new LocalStore(this)) {
                  db.clear();
                }
                pairingNew = false;
                pairingReturnTo = null;
                SyncJob.schedule(this);
                render();
                startLive();
              } catch (Exception e) {
                toast(e.getMessage());
              }
            }));
    body.addView(
        button("Open 9t pairing page", () -> openExternal("https://99t.kennyy.tech/devices")));
    if (pairingNew) {
      body.addView(
          secondary(
              "Cancel — keep current server",
              () -> {
                pairingNew = false;
                pairingReturnTo = null;
                prefs.reloadActive();
                tab = "Connect";
                render();
              }));
    }
    sectionLabel("NO CODE? ASK FROM HERE");
    LinearLayout req = card();
    paragraphIn(req,
        "Point at your server and send a request. Your Devices page shows the same"
            + " 5-digit number — approve it there and this phone pairs itself.");
    labelIn(req, "SERVER ADDRESS");
    String hint = prefs.p.getString("lan", "");
    if (hint.isEmpty()) hint = prefs.p.getString("public", "");
    EditText server = fieldIn(req, "http://192.168.1.20:3265", hint, false);
    labelIn(req, "THIS PHONE'S NAME");
    EditText devName =
        fieldIn(req, "Phone name", prefs.p.getString("pendingName", android.os.Build.MODEL), false);
    toggleIn(req, "Server uses plain public HTTP (no HTTPS)", "publicHttp", false);
    TextView reqStatus = text("", 14, muted);
    req.addView(reqStatus);
    TextView bigCode = text("", 44, ink);
    bigCode.setTypeface(Typeface.create("monospace", Typeface.BOLD));
    bigCode.setGravity(Gravity.CENTER);
    bigCode.setVisibility(View.GONE);
    req.addView(bigCode);
    req.addView(
        secondary(
            "Find server",
            () -> {
              String base = server.getText().toString().trim();
              reqStatus.setText("Looking…");
              io.execute(
                  () -> {
                    String found = probeServer(base);
                    runOnUiThread(
                        () -> {
                          if (!foreground) return;
                          reqStatus.setText(
                              found == null
                                  ? "No 9t server there. Check the address, or scan the local network below."
                                  : "9t server found ✓ — send the request, then approve it on the web.");
                        });
                  });
            }));
    req.addView(
        secondary(
            "Scan local network",
            () -> {
              reqStatus.setText("Scanning…");
              io.execute(
                  () -> {
                    List<String> found = scanLan();
                    runOnUiThread(
                        () -> {
                          if (!foreground) return;
                          if (found.isEmpty())
                            reqStatus.setText(
                                "No 9t server found on this Wi-Fi. Type the address manually.");
                          else {
                            server.setText(found.get(0));
                            reqStatus.setText(
                                found.size() == 1
                                    ? "Found one server — address filled in."
                                    : "Found " + found.size() + " servers — first one filled in.");
                          }
                        });
                  });
            }));
    req.addView(
        button(
            "Send connection request",
            () -> {
              String base = server.getText().toString().trim();
              String name = devName.getText().toString().trim();
              if (name.isEmpty()) {
                toast("Name this phone first.");
                return;
              }
              prefs.p.edit().putString("pendingName", name).apply();
              reqStatus.setText("Sending…");
              bigCode.setVisibility(View.GONE);
              io.execute(
                  () -> {
                    try {
                      String normalized = probeServer(base);
                      if (normalized == null)
                        throw new Exception("No 9t server at that address.");
                      String session =
                          String.valueOf(10000 + new java.util.Random().nextInt(90000));
                      String token =
                          java.util.UUID.randomUUID() + "-" + java.util.UUID.randomUUID();
                      OkHttpClient http = HttpTransfer.client(15000);
                      byte[] raw =
                          HttpTransfer.post(
                              http,
                              normalized + "/api/pair-requests",
                              new JSONObject()
                                  .put("name", name)
                                  .put("sessionNumber", session)
                                  .put("clientToken", token)
                                  .toString());
                      JSONObject reply = new JSONObject(new String(raw, java.nio.charset.StandardCharsets.UTF_8));
                      if (reply.has("error")) throw new Exception(reply.getString("error"));
                      String reqId = reply.getString("id");
                      long expiry = java.time.Instant.parse(reply.getString("expiresAt")).toEpochMilli();
                      boolean local = normalized.startsWith("http:");
                      prefs
                          .p
                          .edit()
                          .putString(local ? "lan" : "public", normalized)
                          .commit();
                      runOnUiThread(
                          () -> {
                            if (!foreground) return;
                            try {
                              prefs
                                  .p
                                  .edit()
                                  .putString(
                                      "pairReq",
                                      new JSONObject()
                                          .put("id", reqId)
                                          .put("token", token)
                                          .put("session", session)
                                          .put("expiry", expiry)
                                          .put("base", normalized)
                                          .toString())
                                  .apply();
                            } catch (Exception ignored) {
                            }
                            bigCode.setText(session);
                            bigCode.setVisibility(View.VISIBLE);
                            reqStatus.setText(
                                "Waiting for approval — approve on the web, then tap Check approval.");
                            pollPairRequest(
                                normalized, reqId, token, session, expiry, reqStatus, bigCode);
                          });
                    } catch (Exception e) {
                      runOnUiThread(
                          () -> {
                            if (foreground) reqStatus.setText("Couldn't send: " + e.getMessage());
                          });
                    }
                  });
            }));
    req.addView(
        secondary(
            "Check approval",
            () -> {
              if (!pairPolling || pairPollTask == null || pendingPairReq() == null) {
                reqStatus.setText("No waiting request — send one first.");
                return;
              }
              reqStatus.setText("Checking…");
              handler.removeCallbacks(pairPollTask);
              handler.post(pairPollTask);
            }));
    // Coming back (or rotated) with a request still waiting: show the code again.
    JSONObject pending = pendingPairReq();
    if (pending != null) {
      try {
        server.setText(pending.getString("base"));
        bigCode.setText(pending.getString("session"));
        bigCode.setVisibility(View.VISIBLE);
        reqStatus.setText("Still waiting — approve on the web, then tap Check approval.");
        pollPairRequest(
            pending.getString("base"),
            pending.getString("id"),
            pending.getString("token"),
            pending.getString("session"),
            pending.getLong("expiry"),
            reqStatus,
            bigCode);
      } catch (Exception ignored) {
      }
    }
  }

  private int pairGen;
  private boolean pairPolling;
  private Runnable pairPollTask;

  private JSONObject pendingPairReq() {
    try {
      String raw = prefs.p.getString("pairReq", null);
      if (raw == null) return null;
      JSONObject o = new JSONObject(raw);
      if (System.currentTimeMillis() > o.getLong("expiry")) {
        prefs.p.edit().remove("pairReq").apply();
        return null;
      }
      return o;
    } catch (Exception e) {
      return null;
    }
  }

  private void pollPairRequest(
      String base, String reqId, String token, String session, long expiry,
      TextView status, TextView code) {
    int gen = ++pairGen;
    pairPolling = true;
    Runnable[] holder = new Runnable[1];
    holder[0] =
        () -> {
          if (gen != pairGen || !foreground) return;
          if (System.currentTimeMillis() > expiry) {
            pairPolling = false;
            prefs.p.edit().remove("pairReq").apply();
            status.setText("Request expired. Send a fresh one.");
            code.setVisibility(View.GONE);
            return;
          }
          io.execute(
              () -> {
                try {
                  OkHttpClient http = HttpTransfer.client(15000);
                  Request httpReq =
                      new Request.Builder()
                          .url(
                              base
                                  + "/api/pair-requests?id="
                                  + java.net.URLEncoder.encode(reqId, "UTF-8")
                                  + "&token="
                                  + java.net.URLEncoder.encode(token, "UTF-8"))
                          .get()
                          .build();
                  String body;
                  try (Response resp = http.newCall(httpReq).execute()) {
                    if (resp.code() == 404) throw new PairDenied();
                    if (!resp.isSuccessful()) throw new Exception("Server error " + resp.code());
                    body = resp.body().string();
                  }
                  JSONObject reply = new JSONObject(body);
                  if ("approved".equals(reply.optString("status"))) {
                    JSONObject dev = reply.getJSONObject("device");
                    dev.put("url", base);
                    String pairing =
                        "9t1:"
                            + Wire.b64(
                                dev.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
                    prefs.pair(pairing);
                    try (LocalStore db = new LocalStore(this)) {
                      db.clear();
                    }
                    runOnUiThread(
                        () -> {
                          if (gen != pairGen || !foreground) return;
                          pairPolling = false;
                          pairingNew = false;
                          pairingReturnTo = null;
                          prefs.p.edit().remove("pairReq").apply();
                          SyncJob.schedule(this);
                          render();
                          startLive();
                          toast("Paired ✓ — approve matched " + session);
                        });
                    return;
                  }
                  handler.postDelayed(holder[0], 3000);
                } catch (PairDenied e) {
                  runOnUiThread(
                      () -> {
                        if (gen == pairGen && foreground) {
                          pairPolling = false;
                          prefs.p.edit().remove("pairReq").apply();
                          status.setText("Request was declined or expired.");
                          code.setVisibility(View.GONE);
                        }
                      });
                } catch (Exception e) {
                  handler.postDelayed(holder[0], 5000);
                }
              });
        };
    pairPollTask = holder[0];
    handler.postDelayed(holder[0], 3000);
  }

  private static final class PairDenied extends Exception {}
  private String timedProbe(String base) {
    long t0 = System.currentTimeMillis();
    String hit = probeServer(base);
    return hit == null ? null : (System.currentTimeMillis() - t0) + " ms";
  }

  private String probeServer(String base) {
    try {
      String url = Endpoint.validate(
          base, base.trim().startsWith("http:"), prefs.p.getBoolean("publicHttp", false));
      if (url.isEmpty()) return null;
      OkHttpClient http = HttpTransfer.client(6000);
      Request req = new Request.Builder().url(url + "/api/status").get().build();
      try (Response resp = http.newCall(req).execute()) {
        if (!resp.isSuccessful() || resp.body() == null) return null;
        JSONObject status = new JSONObject(resp.body().string());
        return status.optBoolean("initialized", false) ? url : null;
      }
    } catch (Exception e) {
      return null;
    }
  }

  private List<String> scanLan() {
    List<String> found = new ArrayList<>();
    try {
      android.net.wifi.WifiManager wifi =
          (android.net.wifi.WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
      int ip = wifi != null && wifi.getConnectionInfo() != null
          ? wifi.getConnectionInfo().getIpAddress()
          : 0;
      if (ip == 0) return found;
      final String base =
          (ip & 0xff) + "." + ((ip >> 8) & 0xff) + "." + ((ip >> 16) & 0xff) + ".";
      ExecutorService pool = Executors.newFixedThreadPool(24);
      List<Future<String>> jobs = new ArrayList<>();
      for (int i = 1; i < 255; i++) {
        final String url = "http://" + base + i + ":3265";
        jobs.add(pool.submit(() -> probeServer(url)));
      }
      pool.shutdown();
      pool.awaitTermination(12, java.util.concurrent.TimeUnit.SECONDS);
      for (Future<String> job : jobs) {
        try {
          if (job.isDone()) {
            String hit = job.get();
            if (hit != null) found.add(hit);
          }
        } catch (Exception ignored) {
        }
      }
    } catch (Exception ignored) {
    }
    return found;
  }

  private void updateStatus() {
    if (foreground
        && tab.equals("Inbox")
        && prefs.paired()
        && renderedVersion != prefs.p.getLong("inboxVersion", 0)) {
      renderedVersion = prefs.p.getLong("inboxVersion", 0);
      if (inboxItems != null) renderInboxItems();
    }
    if (connection != null && prefs.paired()) {
      String route = prefs.p.getString("route", "NOT CONNECTED");
      String server = activeServerName();
      connection.setText(
          (ReceiveService.active ? "● LIVE · " : "○ ") + route.toUpperCase()
              + (server.isEmpty() ? "" : "\n" + server));
    }
    if (receiverStatus != null) receiverStatus.setText(ReceiverDiagnostics.summary(this));
    if (batteryStatus != null) batteryStatus.setText(backgroundStatus());
  }

  private void inbox() {
    TextView inboxTitle = text("Inbox", 30, ink);
    inboxTitle.setTypeface(boldFont);
    body.addView(inboxTitle);
    body.addView(text("Files, snippets and links saved on this phone.", 14, muted));
    LinearLayout quick = new LinearLayout(this);
    quick.setGravity(Gravity.CENTER_VERTICAL);
    TextView status = text(ReceiveService.active ? "Receiver active" : "Ready when you are", 14, ink);
    status.setTypeface(boldFont);
    status.setCompoundDrawables(icon("shield", accent, 20), null, null, null);
    status.setCompoundDrawablePadding(dp(8));
    quick.addView(status, new LinearLayout.LayoutParams(0, -2, 1));
    Button refresh = secondary("Sync", () -> {
      if (!ReceiveService.active) startLive();
      sync(true);
    });
    refresh.setCompoundDrawables(icon("refresh", ink, 18), null, null, null);
    quick.addView(refresh, new LinearLayout.LayoutParams(-2, dp(48)));
    body.addView(quick);
    EditText search = field("Find something…", inboxQuery, false);
    search.setCompoundDrawables(icon("search", muted, 19), null, null, null);
    search.setCompoundDrawablePadding(dp(10));
    search.setContentDescription("Search saved items");
    HorizontalScrollView filterScroll = new HorizontalScrollView(this);
    filterScroll.setHorizontalScrollBarEnabled(false);
    LinearLayout filters = new LinearLayout(this);
    String[] keys = {"all", "file", "snippet", "link"};
    String[] labels = {"Everything", "Files", "Snippets", "Links"};
    for (int i = 0; i < keys.length; i++) {
      final String key = keys[i];
      TextView chip = text(labels[i], 12, ink);
      chip.setTypeface(boldFont);
      chip.setGravity(Gravity.CENTER);
      chip.setPadding(dp(14), dp(12), dp(14), dp(12));
      chip.setMinHeight(dp(48));
      chip.setTag(key);
      boolean active = inboxFilter.equals(key);
      chip.setTextColor(active ? accentInk : ink);
      chip.setBackground(touchSurface(active ? accentSoft : paper, 24));
      chip.setSelected(active);
      LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(-2, -2);
      cp.setMargins(0, dp(6), dp(8), dp(6));
      filters.addView(chip, cp);
      chip.setOnClickListener(v -> {
        inboxFilter = key;
        for (int j = 0; j < filters.getChildCount(); j++) {
          TextView c = (TextView) filters.getChildAt(j);
          boolean selected = key.equals(c.getTag());
          c.setSelected(selected);
          c.setBackground(touchSurface(selected ? accentSoft : paper, 24));
          c.setTextColor(selected ? accentInk : ink);
        }
        renderInboxItems();
      });
    }
    filterScroll.addView(filters);
    body.addView(filterScroll);
    sectionLabel("SAVED ITEMS");
    inboxItems = new LinearLayout(this);
    inboxItems.setOrientation(LinearLayout.VERTICAL);
    body.addView(inboxItems);
    search.addTextChangedListener(new android.text.TextWatcher() {
      public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
      public void onTextChanged(CharSequence s, int start, int before, int count) {
        inboxQuery = s.toString(); renderInboxItems();
      }
      public void afterTextChanged(android.text.Editable e) {}
    });
    renderInboxItems();
  }

  private void renderInboxItems() {
    inboxItems.removeAllViews();
    try (LocalStore db = new LocalStore(this)) {
      List<JSONObject> items = db.items(null);
      int shown = 0;
      for (JSONObject item : items) {
        if (!inboxFilter.equals("all") && !inboxFilter.equals(item.optString("type"))) continue;
        String haystack = item.optString("name") + " " + item.optString("content") + " " + item.optString("url");
        if (!haystack.toLowerCase(Locale.ROOT).contains(inboxQuery.toLowerCase(Locale.ROOT))) continue;
        shown++;
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(12), dp(16), dp(12));
        card.setBackground(sticker(paper, 16));
        card.setElevation(dp(3));
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(-1, -2);
        cp.setMargins(0, dp(7), 0, dp(7));
        inboxItems.addView(card, cp);
        boolean sentFile = item.optBoolean("sentFromPhone")
            && item.optString("status").equals("available")
            && item.optString("type").equals("file");
        TextView kind = text(
                item.getString("type").toUpperCase(Locale.ROOT)
                    + " · "
                    + (sentFile ? "ON SERVER" : item.getString("status").toUpperCase()),
                11,
                accentInk);
        kind.setTypeface(boldFont);
        kind.setBackground(shape(accentSoft, 20));
        kind.setPadding(dp(10), dp(4), dp(10), dp(4));
        kind.setCompoundDrawables(icon(item.optString("type"), accentInk, 17), null, null, null);
        kind.setCompoundDrawablePadding(dp(8));
        card.addView(kind, new LinearLayout.LayoutParams(-2, -2));
        TextView name = text(item.getString("name"), 18, ink);
        name.setTypeface(boldFont);
        name.setMaxLines(2);
        name.setEllipsize(android.text.TextUtils.TruncateAt.END);
        card.addView(name);
        String preview =
            item.optString(
                "content", item.optString("url", readableSize(item.optLong("sizeBytes"))));
        TextView p = text(preview, 14, muted);
        p.setMaxLines(3);
        p.setEllipsize(android.text.TextUtils.TruncateAt.END);
        if (item.optString("type").equals("snippet")) {
          p.setTypeface(Typeface.MONOSPACE);
          p.setTextColor(Color.parseColor("#ded3ee"));
          p.setBackground(shape(Color.parseColor("#292332"), 10));
          p.setPadding(dp(12), dp(12), dp(12), dp(12));
        }
        card.addView(p);
        if (item.optString("status").equals("saved")
            && item.optString("type").equals("file")
            && !item.optString("uri", "").isEmpty()) {
          String mime = item.optString("mimeType", "");
          final String uriS = item.optString("uri");
          if (MediaPreview.isImage(mime) || MediaPreview.isVideo(mime)) {
            final ImageView thumb = new ImageView(this);
            thumb.setScaleType(ImageView.ScaleType.CENTER_CROP);
            thumb.setBackground(shape(accentSoft, 10));
            LinearLayout.LayoutParams thumbP =
                new LinearLayout.LayoutParams(-1, dp(180));
            thumbP.setMargins(0, dp(8), 0, 0);
            card.addView(thumb, thumbP);
            if (MediaPreview.isImage(mime)) {
              try {
                android.graphics.Bitmap small =
                    MediaPreview.imageThumb(this, Uri.parse(uriS), 512);
                if (small != null) thumb.setImageBitmap(small);
                else card.removeView(thumb);
              } catch (Exception e) {
                card.removeView(thumb);
              }
            } else {
              thumb.setTag(uriS);
              io.execute(
                  () -> {
                    final android.graphics.Bitmap frame =
                        MediaPreview.videoThumb(MainActivity.this, Uri.parse(uriS));
                    final String duration =
                        MediaPreview.videoDuration(MainActivity.this, Uri.parse(uriS));
                    handler.post(
                        () -> {
                          if (!uriS.equals(thumb.getTag())) return;
                          if (frame != null) {
                            thumb.setImageBitmap(frame);
                            thumb.setContentDescription("Video · " + duration);
                          } else card.removeView(thumb);
                        });
                  });
            }
          }
        }
        if (item.has("error"))
          card.addView(text(item.getString("error"), 13, Color.parseColor(prefs.p.getBoolean("darkTheme", false) ? "#f2a3ae" : "#b44552")));
        boolean saved = item.optString("status").equals("saved");
        String label =
            saved
                ? (item.optString("type").equals("file") ? "Open file" : "View & copy")
                : sentFile ? "Download a copy" : "Receive this item";
        Button itemAction = secondary(
                label,
                () -> {
                  if (saved) openItem(item);
                  else {
                    try (LocalStore writable = new LocalStore(this)) {
                      writable.update(item.optString("id"), "status", "pending");
                    }
                    sync(true);
                  }
                });
        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams actionsParams = new LinearLayout.LayoutParams(-1, -2);
        actionsParams.setMargins(0, dp(8), 0, 0);
        card.addView(actions, actionsParams);
        Button more = secondary("More", () -> {});
        LinearLayout.LayoutParams moreParams = new LinearLayout.LayoutParams(-2, -2);
        moreParams.setMargins(0, 0, dp(8), 0);
        actions.addView(more, moreParams);
        actions.addView(itemAction, new LinearLayout.LayoutParams(-2, -2));
        more.setOnClickListener(v -> {
          PopupMenu menu = new PopupMenu(this, more);
          menu.getMenu().add(0, 1, 0, item.optBoolean("pinned") ? "Unpin" : "Pin");
          menu.getMenu().add(0, 2, 1, "Share");
          menu.getMenu().add(0, 3, 2, "Delete from phone");
          menu.setOnMenuItemClickListener(choice -> {
            if (choice.getItemId() == 1) {
              try (LocalStore writable = new LocalStore(this)) {
                writable.setPinned(item.optString("id"), !item.optBoolean("pinned"));
              }
              renderInboxItems();
            } else if (choice.getItemId() == 2) {
              shareItem(item);
            } else if (choice.getItemId() == 3) {
              new PocketDialog()
                  .setTitle("Forget this item?")
                  .setMessage("Removes it from this phone only. The workspace keeps its copy;"
                      + " downloaded files stay in Downloads/9t.")
                  .setPositiveButton("Delete", (d, w) -> {
                    try (LocalStore writable = new LocalStore(this)) {
                      writable.remove(item.optString("id"));
                    } catch (Exception e) {
                      toast("Could not delete this item");
                    }
                    renderInboxItems();
                  })
                  .setNegativeButton("Cancel", null)
                  .show();
            }
            return true;
          });
          menu.show();
        });
      }
      if (shown == 0) {
        TextView empty = text(items.isEmpty() ? "A little space for everything." : "Nothing matches yet.", 23, ink);
        empty.setTypeface(boldFont);
        empty.setGravity(Gravity.CENTER);
        empty.setPadding(dp(16), dp(36), dp(16), dp(12));
        empty.setCompoundDrawables(null, icon("Inbox", accent, 56), null, null);
        empty.setCompoundDrawablePadding(dp(24));
        inboxItems.addView(empty);
        TextView hint = text(items.isEmpty()
            ? "Send a file or snippet from your workspace. It will be waiting here, even offline."
            : "Try another search or choose a different type.", 14, muted);
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(dp(20), dp(4), dp(20), dp(24));
        inboxItems.addView(hint);
        if (items.isEmpty()) inboxItems.addView(button("Open workspace", () -> { tab = "Workspace"; render(); }));
      }
    } catch (Exception e) {
      inboxItems.addView(text("Could not load local inbox: " + e.getMessage(), 14, muted));
    }
    try (LocalStore db = new LocalStore(this)) {
      if (!db.items(null).isEmpty())
        inboxItems.addView(
            secondary(
                "Clear local history",
                () ->
                    new PocketDialog()
                        .setTitle("Clear local history?")
                        .setMessage("Removes received items from this phone only."
                            + " The workspace and downloaded files are untouched.")
                        .setPositiveButton("Clear", (d, w) -> {
                          try (LocalStore writable = new LocalStore(this)) {
                            writable.clearInbox();
                          } catch (Exception e) {
                            toast("Could not clear local history");
                          }
                          render();
                        })
                        .setNegativeButton("Cancel", null)
                        .show()));
    } catch (Exception ignored) {}
  }

  private String readableSize(long bytes) {
    if (bytes >= 1024L * 1024L) {
      if (bytes % (1024L * 1024L) == 0) return bytes / (1024L * 1024L) + " MB";
      return String.format(Locale.ROOT, "%.1f MB", bytes / (1024.0 * 1024.0));
    }
    if (bytes >= 1024L) {
      if (bytes % 1024L == 0) return bytes / 1024L + " KB";
      return String.format(Locale.ROOT, "%.1f KB", bytes / 1024.0);
    }
    return bytes + " B";
  }

  private void shareItem(JSONObject item) {
    try {
      if (item.optString("type").equals("file") && !item.optString("uri", "").isEmpty()) {
        Uri uri = Uri.parse(item.optString("uri"));
        Intent share = new Intent(Intent.ACTION_SEND)
            .setType(item.optString("mimeType", "application/octet-stream"))
            .putExtra(Intent.EXTRA_STREAM, uri)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivity(Intent.createChooser(share, "Share file"));
      } else {
        String text = item.optString("content",
            item.optString("url", item.optString("name", "")));
        startActivity(Intent.createChooser(
            new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text),
            "Share text"));
      }
    } catch (Exception e) {
      toast("Nothing available to share it with");
    }
  }

  private void openItem(JSONObject item) {
    if (item.optString("type").equals("file")) {
      String mime = item.optString("mimeType", "application/octet-stream");
      String uriS = item.optString("uri", "");
      if (!uriS.isEmpty() && MediaPreview.isImage(mime)) {
        ImageView preview = new ImageView(this);
        preview.setAdjustViewBounds(true);
        preview.setScaleType(ImageView.ScaleType.FIT_CENTER);
        preview.setMinimumHeight(dp(200));
        try {
          android.graphics.Bitmap full =
              MediaPreview.imageThumb(this, Uri.parse(uriS), 1600);
          if (full != null) preview.setImageBitmap(full);
          else {
            toast("Could not load a preview.");
            return;
          }
        } catch (Exception e) {
          toast("Could not load a preview.");
          return;
        }
        ScrollView scroll = new ScrollView(this);
        scroll.addView(preview);
        new PocketDialog()
            .setTitle(item.optString("name"))
            .setView(scroll)
            .setPositiveButton(
                "Open with…",
                (d, w) -> {
                  try {
                    startActivity(
                        new Intent(Intent.ACTION_VIEW)
                            .setDataAndType(Uri.parse(uriS), mime)
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
                  } catch (Exception e) {
                    toast("Find this file in Downloads/9t, or install an app that can open it.");
                  }
                })
            .setNegativeButton("Close", null)
            .show();
        return;
      }
      try {
        startActivity(
            new Intent(Intent.ACTION_VIEW)
                .setDataAndType(
                    Uri.parse(item.getString("uri")),
                    item.optString("mimeType", "application/octet-stream"))
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
      } catch (Exception e) {
        toast("Find this file in Downloads/9t, or install an app that can open it.");
      }
    } else {
      TextView content = text(item.optString("content"), 16, ink);
      content.setPadding(dp(20), dp(10), dp(20), dp(10));
      content.setTextIsSelectable(true);
      ScrollView scroll = new ScrollView(this);
      scroll.addView(content);
      AlertDialog.Builder dialog = new PocketDialog()
          .setTitle(item.optString("name"))
          .setView(scroll)
          .setPositiveButton(
              "Copy text",
              (d, w) -> {
                try {
                  androidx.core.content.ContextCompat.getSystemService(this, ClipboardManager.class)
                      .setPrimaryClip(ClipData.newPlainText("9t", item.optString("content")));
                  toast("Copied as text");
                } catch (RuntimeException e) {
                  toast(
                      "Android could not copy this snippet. Select a smaller portion of the text.");
                }
              })
          .setNegativeButton("Close", null);
      if (item.optString("type").equals("link") && !item.optString("url", "").isEmpty())
        dialog.setNeutralButton(
            "Open link", (d, w) -> openExternal(item.optString("url")));
      dialog.show();
    }
  }

  private void send() {
    hero("FROM THIS PHONE", "Send it over.",
        "Text, links and files queue here and beam when a route is open.");
    sectionLabel("QUICK STICK");
    EditText compose = field("A thought, a command, a little bit of code…", composeDraft, true);
    compose.addTextChangedListener(new android.text.TextWatcher() {
      public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
      public void onTextChanged(CharSequence s, int start, int before, int count) {
        composeDraft = s.toString();
        updateLinkSwitch();
      }
      public void afterTextChanged(android.text.Editable e) {}
    });
    compose.setTag("compose");
    compose.setMinLines(6);
    final Switch asLink = new Switch(this);
    asLink.setTag("asLink");
    asLink.setText("Send as link");
    asLink.setTextColor(ink);
    asLink.setVisibility(Links.looksLikeUrl(composeDraft) ? View.VISIBLE : View.GONE);
    styleSwitch(asLink);
    body.addView(asLink);
    LinearLayout composeActions = new LinearLayout(this);
    composeActions.setGravity(Gravity.CENTER_VERTICAL);
    body.addView(composeActions);
    composeActions.addView(
        secondary(
            "Paste",
            () -> {
              ClipboardManager cm = androidx.core.content.ContextCompat.getSystemService(this, ClipboardManager.class);
              if (cm.hasPrimaryClip() && cm.getPrimaryClip() != null)
                compose.setText(cm.getPrimaryClip().getItemAt(0).coerceToText(this));
            }));
    composeActions.addView(
        button(
            "Send to 9t",
            () -> {
              String content = compose.getText().toString();
              if (content.trim().isEmpty() || content.length() > 100000) {
                toast("Enter between 1 and 100,000 characters.");
                return;
              }
              boolean link = asLink.getVisibility() == View.VISIBLE && asLink.isChecked();
              if (link && !Links.looksLikeUrl(content)) {
                toast("That doesn't look like a link — uncheck to send text.");
                return;
              }
              try (LocalStore db = new LocalStore(this)) {
                if (link) db.enqueueKind(content.trim(), "link", Links.hostOf(content));
                else db.enqueue(content);
              }
              compose.setText("");
              toast("Queued on this phone");
              sync(true);
            }));
    for (int i = 0; i < composeActions.getChildCount(); i++) {
      LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(0, -2, 1);
      ap.setMargins(i == 0 ? 0 : dp(6), dp(6), i == 0 ? dp(6) : 0, dp(6));
      composeActions.getChildAt(i).setLayoutParams(ap);
    }
    sectionLabel("SEND A LINK");
    EditText linkField = field("https://…", "", false);
    linkField.setTag("linkField");
    linkField.setInputType(android.text.InputType.TYPE_CLASS_TEXT
        | android.text.InputType.TYPE_TEXT_VARIATION_URI);
    body.addView(
        button(
            "Send link",
            () -> {
              String url = linkField.getText().toString();
              if (!Links.looksLikeUrl(url)) {
                toast("Enter an http or https link.");
                return;
              }
              try (LocalStore db = new LocalStore(this)) {
                db.enqueueKind(url.trim(), "link", Links.hostOf(url));
              }
              linkField.setText("");
              toast("Link queued");
              sync(true);
            }));
    sectionLabel("SEND FILES");
    LinearLayout fileActions = new LinearLayout(this);
    fileActions.setGravity(Gravity.CENTER_VERTICAL);
    body.addView(fileActions);
    fileActions.addView(secondary("Choose files", this::pickFiles));
    fileActions.addView(secondary("Take photo", this::takePhoto));
    for (int i = 0; i < fileActions.getChildCount(); i++) {
      LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(0, -2, 1);
      ap.setMargins(i == 0 ? 0 : dp(6), dp(6), i == 0 ? dp(6) : 0, dp(6));
      fileActions.getChildAt(i).setLayoutParams(ap);
    }
    try (LocalStore db = new LocalStore(this)) {
      List<JSONObject> queue = db.outbox();
      sectionLabel("OUTBOX · " + queue.size());
      for (JSONObject item : queue) {
        String value = item.getString("content");
        LinearLayout queuedCard = card();
        paragraphIn(queuedCard, value.substring(0, Math.min(100, value.length())));
        labelIn(queuedCard, item.has("error") ? item.optString("error")
            : "link".equals(item.optString("kind")) ? "LINK · WAITING TO SEND" : "WAITING TO SEND");
        queuedCard.addView(
            secondary(
                "Remove queued text",
                () -> {
                  try (LocalStore queued = new LocalStore(this)) {
                    queued.sent(item.optString("id"));
                  }
                  render();
                }));
      }
      List<JSONObject> files = db.outfiles();
      if (!files.isEmpty()) {
        sectionLabel("UPLOADS · " + files.size());
        for (JSONObject file : files) {
          LinearLayout queuedCard = card();
          paragraphIn(queuedCard, file.optString("name", "file"));
          long size = file.optLong("size", 0), done = file.optLong("offset", 0);
          labelIn(queuedCard, file.has("error") ? file.optString("error")
              : size > 0 ? "UPLOADING · " + (done * 100 / Math.max(1, size)) + "%" : "WAITING TO SEND");
          queuedCard.addView(
              secondary(
                  "Cancel upload",
                  () -> {
                    try (LocalStore queued = new LocalStore(this)) {
                      queued.fileSent(file.optString("id"));
                    }
                    render();
                  }));
        }
      }
    } catch (Exception e) {
      paragraph("Could not load outbox");
    }
  }

  private void updateLinkSwitch() {
    if (body == null) return;
    Switch asLink = body.findViewWithTag("asLink");
    EditText compose = body.findViewWithTag("compose");
    if (asLink == null || compose == null) return;
    boolean isUrl = Links.looksLikeUrl(compose.getText().toString());
    asLink.setVisibility(isUrl ? View.VISIBLE : View.GONE);
    if (isUrl) asLink.setChecked(true);
  }

  private void pickFiles() {
    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT)
        .setType("*/*")
        .addCategory(Intent.CATEGORY_OPENABLE)
        .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
    try {
      startActivityForResult(i, 24);
    } catch (Exception e) {
      toast("No file picker available");
    }
  }

  private Uri cameraTarget;

  private void takePhoto() {
    if (Build.VERSION.SDK_INT >= 23
        && androidx.core.content.ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != android.content.pm.PackageManager.PERMISSION_GRANTED) {
      requestPermissions(new String[] {Manifest.permission.CAMERA}, 31);
      return;
    }
    try {
      java.io.File dir = new java.io.File(getCacheDir(), "camera");
      if (!dir.isDirectory() && !dir.mkdirs()) throw new java.io.IOException("No cache");
      java.io.File shot = new java.io.File(dir, "shot-" + System.currentTimeMillis() + ".jpg");
      cameraTarget = androidx.core.content.FileProvider.getUriForFile(
          this, getPackageName() + ".files", shot);
      Intent i = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE)
          .putExtra(android.provider.MediaStore.EXTRA_OUTPUT, cameraTarget)
          .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
      startActivityForResult(i, 25);
    } catch (Exception e) {
      toast("Camera unavailable");
    }
  }

  @Override
  public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
    super.onRequestPermissionsResult(request, permissions, results);
    if (request == 31
        && results.length > 0
        && results[0] == android.content.pm.PackageManager.PERMISSION_GRANTED) takePhoto();
  }

  private void toggle(String label, String key, boolean fallback) {
    Switch sw = new Switch(this);
    sw.setText(label);
    sw.setTextColor(ink);
    styleSwitch(sw);
    sw.setPadding(0, dp(14), 0, dp(14));
    sw.setChecked(prefs.p.getBoolean(key, fallback));
    sw.setOnCheckedChangeListener((b, value) -> prefs.p.edit().putBoolean(key, value).apply());
    body.addView(sw);
  }

  private String activeServerName() {
    try {
      String active = prefs.activeServer();
      if (active == null) return "";
      JSONObject prof = prefs.servers().optJSONObject(active);
      return prof == null ? "" : prof.optString("name", "");
    } catch (Exception e) {
      return "";
    }
  }

  private void serversSection() {
    LinearLayout servers =
        disclosure("Servers", "server", "Switch between workspaces. Only the active one receives.");
    try {
      JSONObject all = prefs.servers();
      String active = prefs.activeServer();
      java.util.Iterator<String> ids = all.keys();
      if (!ids.hasNext()) paragraphIn(servers, "No servers yet.");
      while (ids.hasNext()) {
        String id = ids.next();
        JSONObject prof = all.getJSONObject(id);
        String name = prof.optString("name", "Server");
        String lan = prof.optString("lan", ""), pub = prof.optString("public", "");
        String host = Prefs.hostOf(!lan.isEmpty() ? lan : pub);
        boolean isActive = id.equals(active);
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(dp(14), dp(12), dp(14), dp(12));
        row.setBackground(sticker(paper, 14));
        row.setElevation(dp(2));
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(-1, -2);
        rp.setMargins(0, dp(6), 0, dp(6));
        servers.addView(row, rp);
        TextView title = text((isActive ? "● " : "○ ") + name, 17, ink);
        title.setTypeface(boldFont);
        row.addView(title);
        TextView sub = text(host, 13, muted);
        row.addView(sub);
        if (!isActive) {
          Button sw = secondary("Switch to this server", () -> {});
          final String target = id;
          sw.setOnClickListener(
              v -> {
                if (prefs.switchServer(target)) {
                  restartLive();
                  CookieManager.getInstance().removeAllCookies(null);
                  CookieManager.getInstance().flush();
                  render();
                  sync(false);
                } else toast("Could not switch servers.");
              });
          row.addView(sw);
        }
        Button rn = secondary("Rename", () -> {});
        rn.setOnClickListener(
            v -> {
              EditText input = plainField("Server name");
              input.setText(name);
              new PocketDialog()
                  .setTitle("Rename server")
                  .setView(input)
                  .setPositiveButton(
                      "Save",
                      (d, w) -> {
                        String next = input.getText().toString().trim();
                        if (next.isEmpty()) {
                          toast("Enter a name.");
                          return;
                        }
                        prefs.renameProfile(id, next);
                        render();
                      })
                  .setNegativeButton("Cancel", null)
                  .show();
            });
        row.addView(rn);
        Button rm = secondary("Remove", () -> {});
        final String removeName = name;
        rm.setOnClickListener(
            v ->
                new PocketDialog()
                    .setTitle("Remove " + removeName + "?")
                    .setMessage(
                        "This phone forgets the pairing and clears this server's local inbox."
                            + " Downloaded files stay in Downloads/9t. Revoke it on that server's website too.")
                    .setPositiveButton("Remove", (d, w) -> removeServer(id))
                    .setNegativeButton("Cancel", null)
                    .show());
        row.addView(rm);
      }
    } catch (Exception e) {
      paragraphIn(servers, "Could not list servers.");
    }
    servers.addView(
        button(
            "Add another server",
            () -> {
              prefs.saveActiveProfile();
              pairingReturnTo = prefs.activeServer();
              pairingNew = true;
              tab = "Connect";
              render();
            }));
  }

  private void restartLive() {
    stopService(new Intent(this, ReceiveService.class));
    if (prefs.p.getBoolean("enabled", true)) ensureLive();
  }

  private void removeServer(String id) {
    io.execute(
        () -> {
          while (SyncEngine.isRunning()) {
            try {
              Thread.sleep(100);
            } catch (InterruptedException e) {
              return;
            }
          }
          try (LocalStore db = new LocalStore(this)) {
            db.clearServer(id);
          }
          java.io.File dir = new java.io.File(getFilesDir(), "transfers");
          java.io.File[] files = dir.listFiles();
          if (files != null) for (java.io.File f : files) if (f.getName().startsWith(id + "-")) f.delete();
          String next = prefs.removeProfile(id);
          runOnUiThread(
              () -> {
                if (next != null) {
                  if (prefs.switchServer(next)) {
                    restartLive();
                    CookieManager.getInstance().removeAllCookies(null);
                    CookieManager.getInstance().flush();
                  }
                  render();
                  sync(false);
                } else {
                  fullReset();
                }
              });
        });
  }

  private void fullReset() {
    stopService(new Intent(this, ReceiveService.class));
    SyncJob.cancel(this);
    io.execute(
        () -> {
          while (SyncEngine.isRunning()) {
            try {
              Thread.sleep(100);
            } catch (InterruptedException e) {
              return;
            }
          }
          java.io.File dir = new java.io.File(getFilesDir(), "transfers");
          java.io.File[] files = dir.listFiles();
          if (files != null) for (java.io.File f : files) f.delete();
          SharedPreferences.Editor e = prefs.p.edit();
          for (String k : Prefs.PAIR_STATE_KEYS) e.remove(k);
          e.putBoolean("enabled", false).commit();
          runOnUiThread(
              () -> {
                pairingNew = false;
                composeDraft = "";
                inboxQuery = "";
                inboxFilter = "all";
                openSettings.clear();
                applyTheme();
                CookieManager.getInstance().removeAllCookies(null);
                CookieManager.getInstance().flush();
                WebStorage.getInstance().deleteAllData();
                render();
              });
        });
  }

  private void settings() {
    serversSection();
    hero("9t " + ReceiverDiagnostics.version(this), "Stay connected.",
        "LAN first, internet fallback. Both addresses must reach the same paired server.");
    LinearLayout look = disclosure("Appearance", "moon", "Make this little space yours.");
    Switch theme = new Switch(this);
    theme.setText("Dark theme");
    theme.setTextColor(ink);
    styleSwitch(theme);
    theme.setPadding(0, dp(8), 0, dp(8));
    theme.setChecked(prefs.p.getBoolean("darkTheme", false));
    theme.setOnCheckedChangeListener(
        (button, value) -> {
          prefs.p.edit().putBoolean("darkTheme", value).apply();
          applyTheme();
          render();
        });
    look.addView(theme);
    LinearLayout privacy = disclosure("Privacy", "lock", "Lock this app behind a PIN.");
    if (prefs.p.contains("pinHash")) {
      privacy.addView(secondary("Change PIN", () -> pinChange()));
      privacy.addView(secondary("Remove PIN", () -> pinRemove()));
    } else {
      privacy.addView(button("Set app PIN", () -> pinSet()));
    }
    paragraphIn(privacy,
        "Locked on every fresh start and after 2 minutes in the background."
            + " Pairing keys stay encrypted either way; the PIN only guards this screen.");
    LinearLayout conn = disclosure("Your workspace", "Connect", "Addresses and connection mode");
    paragraphIn(conn, prefs.p.getString("status", "Ready to connect"));
    paragraphIn(conn,
        "Auto prefers LAN, switches to internet on failure, and checks LAN again.");
    toggleIn(conn, "Allow Workspace over HTTP LAN (less secure)", "httpWorkspace", false);
    paragraphIn(conn,
        "HTTP Workspace sends your login over the local network unencrypted."
            + " Only enable this on networks you trust.");
    toggleIn(conn, "Allow plain HTTP to public servers (less secure)", "publicHttp", false);
    paragraphIn(conn,
        "For servers like http://203.0.113.10:6119 without HTTPS."
            + " Transfers stay encrypted, but metadata is visible on the wire."
            + " Prefer HTTPS whenever you can.");
    labelIn(conn, "LAN ADDRESS");
    EditText lan = fieldIn(conn, "http://192.168.1.20:3265", prefs.p.getString("lan", ""), false);
    labelIn(conn, "PUBLIC ADDRESS");
    EditText remote = fieldIn(conn, "https://9t.example.com", prefs.p.getString("public", ""), false);
    labelIn(conn, "MODE");
    Spinner mode = new Spinner(this);
    String[] labels = {"Automatic · LAN first", "LAN only", "Internet only"};
    mode.setAdapter(new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, labels) {
      @Override public View getView(int position, View recycled, ViewGroup parent) { return option(position); }
      @Override public View getDropDownView(int position, View recycled, ViewGroup parent) { return option(position); }
      private View option(int position) {
        TextView t = text(getItem(position), 14, ink);
        t.setPadding(dp(12), dp(16), dp(12), dp(16));
        t.setBackgroundColor(paper);
        t.setMinHeight(dp(48));
        return t;
      }
    });
    mode.setBackground(sticker(paper, 14));
    mode.setPadding(dp(14), dp(4), dp(14), dp(4));
    String current = prefs.p.getString("mode", "auto");
    mode.setSelection(current.equals("lan") ? 1 : current.equals("public") ? 2 : 0);
    LinearLayout.LayoutParams modeP = new LinearLayout.LayoutParams(-1, -2);
    modeP.setMargins(0, dp(6), 0, dp(6));
    conn.addView(mode, modeP);
    conn.addView(
        button(
            "Save connection",
            () -> {
              try {
                boolean plainPublic = prefs.p.getBoolean("publicHttp", false);
                String l = Endpoint.validate(lan.getText().toString(), true, plainPublic),
                    r = Endpoint.validate(remote.getText().toString(), false, plainPublic);
                int selected = mode.getSelectedItemPosition();
                if ((selected == 1 && l.isEmpty())
                    || (selected == 2 && r.isEmpty())
                    || (l.isEmpty() && r.isEmpty()))
                  throw new Exception("Add an address for the selected mode.");
                prefs
                    .p
                    .edit()
                    .putString("lan", l)
                    .putString("public", r)
                    .putString("mode", selected == 1 ? "lan" : selected == 2 ? "public" : "auto")
                    .commit();
                Transport.lanRetryAt = 0;
                toast("Connection saved");
                if (prefs.p.getBoolean("enabled", true)) ensureLive();
                sync(false);
              } catch (Exception e) {
                toast(e.getMessage());
              }
            }));
    TextView routeStatus = text("", 14, muted);
    conn.addView(routeStatus);
    conn.addView(
        secondary(
            "Check connection",
            () -> {
              String l = lan.getText().toString().trim();
              String r = remote.getText().toString().trim();
              if (l.isEmpty() && r.isEmpty()) {
                toast("Enter an address first.");
                return;
              }
              routeStatus.setText("Checking…");
              io.execute(
                  () -> {
                    String lanRes = l.isEmpty() ? null : timedProbe(l);
                    String pubRes = r.isEmpty() ? null : timedProbe(r);
                    StringBuilder sb = new StringBuilder();
                    if (!l.isEmpty()) sb.append("LAN: ").append(lanRes == null ? "✗ unreachable" : "✓ " + lanRes);
                    if (!r.isEmpty()) {
                      if (sb.length() > 0) sb.append("\n");
                      sb.append("Internet: ").append(pubRes == null ? "✗ unreachable" : "✓ " + pubRes);
                    }
                    String out = sb.toString();
                    runOnUiThread(
                        () -> {
                          if (foreground) routeStatus.setText(out);
                        });
                  });
            }));
    LinearLayout downloads = disclosure("Files & clipboard", "download", "Auto-save, clipboard and download limits");
    toggleIn(downloads, "Automatically save incoming files", "files", true);
    toggleIn(downloads, "Copy incoming snippets to clipboard", "copy", true);
    toggleIn(downloads, "Notify me about new arrivals", "arriveNotify", true);
    toggleIn(downloads, "Files: unmetered connections only", "wifiOnly", false);
    labelIn(downloads, "FILE SIZE CAP (MB)");
    EditText max =
        fieldIn(downloads, "500", String.valueOf(prefs.p.getLong("maxMb", 500)), false);
    max.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
    downloads.addView(
        button(
            "Save download limit",
            () -> {
              try {
                long n = Long.parseLong(max.getText().toString());
                if (n < 1 || n > 2048) throw new Exception();
                prefs.p.edit().putLong("maxMb", n).apply();
                toast("Limit saved");
              } catch (Exception e) {
                toast("Choose 1–2048 MB");
              }
            }));
    if (Build.VERSION.SDK_INT < 29) downloads.addView(secondary("Allow download storage", this::requestNotifications));
    LinearLayout live = disclosure("Background receiving", "shield",
        ReceiveService.active ? "Active · keep your things flowing" : "Permissions, receiving and diagnostics");
    receiverStatus = text(ReceiverDiagnostics.summary(this), 14, muted);
    live.addView(receiverStatus);
    batteryStatus = text(backgroundStatus(), 14, muted);
    live.addView(batteryStatus);
    live.addView(button("Start live receiving", this::startLive));
    live.addView(button("Allow background receiving", this::requestBackgroundAccess));
    live.addView(secondary("Phone app settings", this::openAppSettings));
    paragraphIn(live,
        "Allow background receiving in Android's prompt so files can arrive while the screen is"
            + " off. If your phone provides extra battery controls, allow background activity and auto-start in app"
            + " settings if offered. Live receiving uses extra battery.");
    live.addView(secondary("Receiver details", this::showReceiverDetails));
    live.addView(
        secondary(
            "Pause all receiving",
            () -> {
              prefs.p.edit().putBoolean("enabled", false).apply();
              stopService(new Intent(this, ReceiveService.class));
              SyncJob.cancel(this);
              prefs.status("Receiving paused");
              render();
            }));
    live.addView(
        secondary(
            "Notification settings",
            () ->
                startActivity(
                    (Build.VERSION.SDK_INT >= 26
                        ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())
                        : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))))));
    paragraphIn(live,
        "With a LAN address and Automatic or LAN-only mode, receiving keeps the connection to your"
            + " computer active until you pause it, including after a restart. Internet-only"
            + " receiving uses a five-hour live session, then scheduled checks. Force-stop and phone battery controls"
            + " can still stop receiving.");
    paragraphIn(live,
        "Transfers are encrypted even on HTTP LAN routes. The full Workspace screen requires HTTPS."
            + " LAN-only use needs a server on your local network; a cloud server still needs"
            + " internet or a reachable private route.");
    LinearLayout danger = disclosure("Disconnect", "close", "Remove the active server from this phone");
    paragraphIn(danger,
        "Forgets the active server's pairing and clears its local history. Downloaded files stay in Downloads/9t. Revoke the phone on that server's website too. Manage all servers above.");
    danger.addView(
        secondary(
            "Disconnect active server",
            () ->
                new PocketDialog()
                    .setTitle("Disconnect this server?")
                    .setMessage(
                        "Local history for the active server will be cleared. Downloaded files stay in"
                            + " Downloads/9t. Revoke this phone from that server's device settings"
                            + " too.")
                    .setPositiveButton("Disconnect", (d, w) -> disconnect())
                    .setNegativeButton("Cancel", null)
                    .show()));
  }

  private void startLive() {
    prefs.p.edit().putBoolean("enabled", true).apply();
    requestNotifications();
    ensureLive();
  }

  private String backgroundStatus() {
    boolean exempt =
        Compat.batteryExempt(this);
    boolean restricted = Compat.backgroundRestricted(this);
    return (exempt
            ? "Android background battery access: allowed."
            : "Android background battery access: restricted. Tap Allow background receiving.")
        + (restricted ? " Background activity is also restricted in Phone app settings." : "");
  }

  private void offerBackgroundAccess() {
    if (prefs.p.getBoolean("backgroundPromptV3", false)
        || Compat.batteryExempt(this))
      return;
    prefs.p.edit().putBoolean("backgroundPromptV3", true).apply();
    new PocketDialog()
        .setTitle("Receive in the background")
        .setMessage(
            "Allow 9t to receive files and text while another app is open or the screen is locked."
                + " Android will ask to allow background battery use. This uses extra battery.")
        .setPositiveButton("Continue", (d, w) -> requestBackgroundAccess())
        .setNegativeButton("Later", null)
        .show();
  }

  private void requestBackgroundAccess() {
    if (Compat.batteryExempt(this)) {
      if (Compat.backgroundRestricted(this)) openAppSettings();
      else toast("Android background battery access is already allowed.");
      return;
    }
    try {
      startActivity(
          new Intent(
              Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
              Uri.parse("package:" + getPackageName())));
    } catch (ActivityNotFoundException | SecurityException e) {
      try {
        startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
      } catch (ActivityNotFoundException missing) {
        openAppSettings();
      }
    }
  }

  private void openAppSettings() {
    startActivity(
        new Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:" + getPackageName())));
  }

  private void showReceiverDetails() {
    String report = ReceiverDiagnostics.report(this);
    TextView content = text(report, 14, ink);
    content.setPadding(dp(20), dp(10), dp(20), dp(10));
    content.setTextIsSelectable(true);
    ScrollView scroll = new ScrollView(this);
    scroll.addView(content);
    new PocketDialog()
        .setTitle("Receiver details")
        .setView(scroll)
        .setPositiveButton(
            "Copy details",
            (d, w) -> {
              androidx.core.content.ContextCompat.getSystemService(this, ClipboardManager.class)
                  .setPrimaryClip(ClipData.newPlainText("9t receiver details", report));
              toast("Receiver details copied");
            })
        .setNegativeButton("Close", null)
        .show();
  }

  private void ensureLive() {
    SyncJob.schedule(this);
    try {
      androidx.core.content.ContextCompat.startForegroundService(this,
          new Intent(this, ReceiveService.class).setAction(ReceiveService.START));
    } catch (Exception e) {
      ReceiverDiagnostics.error(this, e);
      toast(
          "Android could not start live receiving. Open the app again; scheduled sync remains"
              + " enabled.");
    }
  }

  private void requestNotifications() {
    if (Build.VERSION.SDK_INT >= 23 && Build.VERSION.SDK_INT < 29
        && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != android.content.pm.PackageManager.PERMISSION_GRANTED)
      requestPermissions(new String[] {Manifest.permission.WRITE_EXTERNAL_STORAGE}, 12);
    if (Build.VERSION.SDK_INT >= 33
        && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
            != android.content.pm.PackageManager.PERMISSION_GRANTED)
      requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 11);
  }

  private void sync(boolean redraw) {
    io.execute(
        () -> {
          try {
            SyncEngine.run(
                this,
                () ->
                    !prefs.p.getBoolean("enabled", true) || Thread.currentThread().isInterrupted(),
                "open app");
          } catch (Exception ignored) {
          }
          runOnUiThread(
              () -> {
                if (redraw && foreground && !tab.equals("Workspace")) render();
                else updateStatus();
              });
        });
  }

  private void disconnect() {
    // Multi-server: disconnect removes the active server (use Servers → Remove
    // for the same). Falls back to a full reset when nothing is paired.
    String active = prefs.activeServer();
    if (active == null) {
      fullReset();
      return;
    }
    removeServer(active);
  }

  @SuppressWarnings("SetJavaScriptEnabled")
  private void workspace(ScrollView scroll) {
    title("Your whole 9t.");
    paragraph("Connecting to the full workspace…");
    io.execute(
        () -> {
          try {
            Transport transport = new Transport(this);
            JSONObject session = null;
            String origin = "";
            Exception last = null;
            for (Transport.Route route : transport.routes()) {
              boolean secure = route.url.startsWith("https://");
              if (!secure
                  && !(route.url.startsWith("http://")
                      && prefs.p.getBoolean("httpWorkspace", false))) continue;
              try {
                session = transport.callAt(route, new JSONObject().put("action", "webSession"));
                origin = route.url;
                break;
              } catch (Exception e) {
                last = e;
              }
            }
            if (session == null)
              throw new Exception(
                  last == null
                      ? "Add an HTTPS address in Connect to use the full workspace. Encrypted"
                          + " native transfers still work on HTTP LAN."
                      : "Workspace unavailable. Your saved inbox still works offline.");
            String selected = origin, token = session.getString("token");
            runOnUiThread(
                () -> {
                  if (!foreground || !tab.equals("Workspace")) return;
                  webOrigin = selected;
                  CookieManager.getInstance().setAcceptCookie(true);
                  String cookie = "9t_session=" + token
                      + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600";
                  if (selected.startsWith("https://")) cookie += "; Secure";
                  CookieManager.getInstance().setCookie(selected, cookie,
                          ok -> {
                            if (!tab.equals("Workspace") || isFinishing()) return;
                            CookieManager.getInstance().flush();
                            shell.removeView(scroll);
                            web = new WebView(this);
                            shell.addView(web, 1, new LinearLayout.LayoutParams(-1, 0, 1));
                            web.getSettings().setJavaScriptEnabled(true);
                            web.getSettings().setDomStorageEnabled(true);
                            web.getSettings().setAllowFileAccess(false);
                            web.getSettings().setAllowContentAccess(false);
                            web.getSettings()
                                .setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
                            CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
                            web.setWebViewClient(
                                new WebViewClient() {
                                  @Override
                                  public boolean shouldOverrideUrlLoading(WebView v, String url) {
                                    Uri u = Uri.parse(url);
                                    if (sameOrigin(u)) return false;
                                    if ("https".equals(u.getScheme()) || "http".equals(u.getScheme())) openExternal(url);
                                    return true;
                                  }

                                  @Override
                                  public boolean shouldOverrideUrlLoading(
                                      WebView v, WebResourceRequest r) {
                                    Uri u = r.getUrl();
                                    if (sameOrigin(u)) return false;
                                    if (r.isForMainFrame()
                                        && ("https".equals(u.getScheme())
                                            || "http".equals(u.getScheme())))
                                      openExternal(u.toString());
                                    return true;
                                  }

                                  @Override
                                  public void onReceivedError(
                                      WebView v, WebResourceRequest r, WebResourceError e) {
                                    if (r.isForMainFrame()) retryWorkspace();
                                  }

                                  @Override
                                  public void onReceivedHttpError(
                                      WebView v,
                                      WebResourceRequest r,
                                      WebResourceResponse response) {
                                    if (response.getStatusCode() == 401 && sameOrigin(r.getUrl()))
                                      retryWorkspace();
                                  }

                                  @Override
                                  public void onReceivedSslError(
                                      WebView v,
                                      android.webkit.SslErrorHandler h,
                                      android.net.http.SslError e) {
                                    h.cancel();
                                    toast("Server certificate is not trusted.");
                                  }
                                });
                            web.setWebChromeClient(
                                new WebChromeClient() {
                                  @Override
                                  public boolean onShowFileChooser(
                                      WebView v,
                                      ValueCallback<Uri[]> callback,
                                      FileChooserParams params) {
                                    if (chooser != null) chooser.onReceiveValue(null);
                                    chooser = callback;
                                    Intent i =
                                        new Intent(Intent.ACTION_OPEN_DOCUMENT)
                                            .setType("*/*")
                                            .addCategory(Intent.CATEGORY_OPENABLE)
                                            .putExtra(
                                                Intent.EXTRA_ALLOW_MULTIPLE,
                                                params.getMode()
                                                    == FileChooserParams.MODE_OPEN_MULTIPLE);
                                    try {
                                      startActivityForResult(i, 22);
                                    } catch (Exception e) {
                                      chooser.onReceiveValue(null);
                                      chooser = null;
                                    }
                                    return true;
                                  }
                                });
                            web.setDownloadListener(
                                (url, userAgent, disposition, mime, length) -> {
                                  Uri uri = Uri.parse(url);
                                  if (!sameOrigin(uri)) {
                                    toast("Download origin not trusted");
                                    return;
                                  }
                                  try {
                                    DownloadManager.Request r = new DownloadManager.Request(uri);
                                    String cookies = CookieManager.getInstance().getCookie(url);
                                    if (cookies != null) r.addRequestHeader("Cookie", cookies);
                                    r.setTitle(URLUtil.guessFileName(url, disposition, mime))
                                        .setMimeType(mime)
                                        .setNotificationVisibility(
                                            DownloadManager.Request
                                                .VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                                        .setDestinationInExternalPublicDir(
                                            Environment.DIRECTORY_DOWNLOADS,
                                            "9t/" + URLUtil.guessFileName(url, disposition, mime));
                                    androidx.core.content.ContextCompat.getSystemService(this, DownloadManager.class).enqueue(r);
                                    toast("Saving to Downloads/9t");
                                  } catch (Exception e) {
                                    toast("Could not start download");
                                  }
                                });
                            web.loadUrl(selected);
                          });
                });
          } catch (Exception e) {
            runOnUiThread(
                () -> {
                  if (tab.equals("Workspace") && web == null) {
                    body.removeAllViews();
                    title("Workspace offline");
                    paragraph(e.getMessage());
                    body.addView(button("Try again", this::render));
                    body.addView(
                        button(
                            "Connection settings",
                            () -> {
                              tab = "Connect";
                              render();
                            }));
                  }
                });
          }
        });
  }

  private void retryWorkspace() {
    long now = System.currentTimeMillis();
    if (now < webRetryAt) return;
    webRetryAt = now + 30000;
    toast("Reconnecting workspace…");
    handler.postDelayed(
        () -> {
          if (foreground && tab.equals("Workspace")) render();
        },
        3000);
  }

  private boolean sameOrigin(Uri u) {
    Uri origin = Uri.parse(webOrigin);
    return "https".equals(u.getScheme())
        && Objects.equals(u.getHost(), origin.getHost())
        && u.getPort() == origin.getPort();
  }

  @Override
  protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (request == 22 && chooser != null) {
      Uri[] uris = null;
      if (result == RESULT_OK && data != null) {
        if (data.getClipData() != null) {
          int count = data.getClipData().getItemCount();
          uris = new Uri[count];
          for (int i = 0; i < count; i++) uris[i] = data.getClipData().getItemAt(i).getUri();
        } else if (data.getData() != null) uris = new Uri[] {data.getData()};
      }
      chooser.onReceiveValue(uris);
      chooser = null;
    }
    if (request == 24 && result == RESULT_OK && data != null) {
      java.util.ArrayList<Uri> picked = new java.util.ArrayList<>();
      if (data.getClipData() != null) {
        for (int i = 0; i < data.getClipData().getItemCount(); i++)
          picked.add(data.getClipData().getItemAt(i).getUri());
      } else if (data.getData() != null) picked.add(data.getData());
      for (Uri uri : picked) stageSharedFile(uri);
    }
    if (request == 25) {
      if (result == RESULT_OK && cameraTarget != null) {
        try {
          getContentResolver().takePersistableUriPermission(
              cameraTarget, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Exception ignored) {}
        stageSharedFile(cameraTarget);
      }
      cameraTarget = null;
    }
  }

  @Override
  public void onBackPressed() {
    if (web != null && web.canGoBack()) {
      web.goBack();
      return;
    }
    if (!tab.equals("Inbox")) {
      tab = "Inbox";
      render();
      return;
    }
    super.onBackPressed();
  }

  private void openExternal(String url) {
    try {
      startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
    } catch (Exception e) {
      toast("No browser available");
    }
  }

  private final class PocketDialog extends AlertDialog.Builder {
    PocketDialog() { super(MainActivity.this); }
    @Override public AlertDialog show() {
      AlertDialog dialog = super.show();
      if (dialog.getWindow() != null) {
        dialog.getWindow().setBackgroundDrawable(sticker(paper, 18));
        styleDialogText(dialog.getWindow().getDecorView());
      }
      return dialog;
    }
  }

  private void styleDialogText(View view) {
    if (view instanceof TextView) {
      TextView t = (TextView) view;
      t.setTypeface(view instanceof Button ? boldFont : regularFont);
      t.setTextColor(ink);
      if (view instanceof Button) ((Button) view).setAllCaps(false);
    }
    if (view instanceof ViewGroup) {
      ViewGroup group = (ViewGroup) view;
      for (int i = 0; i < group.getChildCount(); i++) styleDialogText(group.getChildAt(i));
    }
  }

  private void toast(String value) {
    Toast.makeText(this, value == null ? "Please try again" : value, Toast.LENGTH_LONG).show();
  }
}
