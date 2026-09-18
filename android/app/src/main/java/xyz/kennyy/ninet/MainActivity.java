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
import org.json.*;

public final class MainActivity extends Activity {
  // Keep the native surfaces on the same visual tokens as the web workspace.
  private int bg, paper, ink, green, muted;
  private LinearLayout shell, body, nav;
  private TextView connection;
  private TextView receiverStatus, batteryStatus;
  private Prefs prefs;
  private String tab = "Inbox";
  private WebView web;
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
    applyTheme();
    Notices.channels(this);
    getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    render();
    handleSend(getIntent());
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
  }

  @Override
  protected void onPause() {
    foreground = false;
    ReceiverDiagnostics.visibility(this, false);
    handler.removeCallbacks(refresh);
    super.onPause();
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
    if (Intent.ACTION_SEND.equals(intent.getAction())
        && intent.getStringExtra(Intent.EXTRA_TEXT) != null) {
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
    }
  }

  private int dp(int n) {
    return Math.round(n * getResources().getDisplayMetrics().density);
  }

  private void applyTheme() {
    boolean dark = prefs != null && prefs.p.getBoolean("darkTheme", false);
    bg = dark ? Color.rgb(23, 29, 30) : Color.rgb(246, 245, 241);
    paper = dark ? Color.rgb(32, 40, 41) : Color.WHITE;
    ink = dark ? Color.rgb(237, 240, 231) : Color.rgb(36, 43, 49);
    green = dark ? Color.rgb(183, 216, 138) : Color.rgb(36, 115, 92);
    muted = dark ? Color.rgb(162, 173, 167) : Color.rgb(119, 126, 129);
    getWindow().setStatusBarColor(bg);
    getWindow().setNavigationBarColor(bg);
    int flags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
    getWindow().getDecorView().setSystemUiVisibility(dark ? 0 : flags);
  }

  private GradientDrawable shape(int color, int radius) {
    GradientDrawable d = new GradientDrawable();
    d.setColor(color);
    d.setCornerRadius(dp(radius));
    return d;
  }

  private TextView text(String value, int size, int color) {
    TextView v = new TextView(this);
    v.setText(value);
    v.setTextSize(size);
    v.setTextColor(color);
    v.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
    v.setPadding(0, dp(6), 0, dp(6));
    return v;
  }

  private TextView title(String value) {
    TextView t = text(value, 32, ink);
    t.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
    body.addView(t);
    return t;
  }

  private void paragraph(String value) {
    TextView t = text(value, 15, muted);
    t.setLineSpacing(dp(3), 1);
    body.addView(t);
  }

  private Button button(String label, Runnable action) {
    Button b = new Button(this);
    b.setText(label);
    b.setAllCaps(false);
    b.setTextColor(prefs.p.getBoolean("darkTheme", false) ? ink : Color.WHITE);
    b.setTextSize(15);
    b.setBackground(shape(green, 14));
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, dp(52));
    p.setMargins(0, dp(8), 0, dp(8));
    b.setLayoutParams(p);
    b.setOnClickListener(v -> action.run());
    return b;
  }

  private EditText field(String hint, String value, boolean multiline) {
    EditText e = new EditText(this);
    e.setTextColor(ink);
    e.setHintTextColor(muted);
    e.setHint(hint);
    e.setText(value);
    e.setTextSize(15);
    e.setPadding(dp(14), dp(12), dp(14), dp(12));
    e.setBackground(shape(paper, 12));
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
    receiverStatus = null;
    batteryStatus = null;
    renderedVersion = prefs.p.getLong("inboxVersion", 0);
    if (web != null) {
      web.destroy();
      web = null;
    }
    shell = new LinearLayout(this);
    shell.setOrientation(LinearLayout.VERTICAL);
    shell.setBackgroundColor(bg);
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
    header.setPadding(dp(20), dp(10), dp(20), dp(8));
    TextView logo = text("9t", 30, green);
    logo.setTypeface(null, Typeface.BOLD);
    header.addView(logo);
    connection = text("YOUR POCKET WORKSPACE", 11, muted);
    connection.setGravity(Gravity.END);
    header.addView(connection, new LinearLayout.LayoutParams(0, -2, 1));
    shell.addView(header);
    ScrollView scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    body = new LinearLayout(this);
    body.setOrientation(LinearLayout.VERTICAL);
    body.setPadding(dp(20), dp(12), dp(20), dp(24));
    scroll.addView(body);
    shell.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
    if (!prefs.paired()) {
      onboarding();
      return;
    }
    nav = new LinearLayout(this);
    nav.setPadding(dp(6), dp(6), dp(6), dp(6));
    nav.setBackgroundColor(paper);
    for (String name : new String[] {"Inbox", "Workspace", "Send", "Connect"}) {
      Button b = new Button(this);
      b.setText(name);
      b.setAllCaps(false);
      b.setTextSize(12);
      b.setTextColor(
          tab.equals(name)
              ? (prefs.p.getBoolean("darkTheme", false) ? ink : Color.WHITE)
              : green);
      b.setBackground(shape(tab.equals(name) ? green : paper, 12));
      nav.addView(b, new LinearLayout.LayoutParams(0, dp(52), 1));
      b.setOnClickListener(
          v -> {
            tab = name;
            render();
          });
    }
    shell.addView(nav);
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
    title("Good things.\nRight here.");
    paragraph(
        "Your 9t workspace, with files delivered straight to your phone and snippets ready to"
            + " paste.");
    TextView badge = text("LAN FIRST  ·  ENCRYPTED  ·  YOUR SERVER", 12, green);
    body.addView(badge);
    body.addView(text("Connect your workspace", 21, ink));
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
                SyncJob.schedule(this);
                render();
                startLive();
              } catch (Exception e) {
                toast(e.getMessage());
              }
            }));
    body.addView(
        button("Open 9t pairing page", () -> openExternal("https://9t.kennyy.xyz/devices")));
  }

  private void updateStatus() {
    if (foreground
        && tab.equals("Inbox")
        && prefs.paired()
        && renderedVersion != prefs.p.getLong("inboxVersion", 0)) {
      render();
      return;
    }
    if (connection != null && prefs.paired()) {
      String route = prefs.p.getString("route", "NOT CONNECTED");
      connection.setText((ReceiveService.active ? "● LIVE · " : "○ ") + route.toUpperCase());
    }
    if (receiverStatus != null) receiverStatus.setText(ReceiverDiagnostics.summary(this));
    if (batteryStatus != null) batteryStatus.setText(backgroundStatus());
  }

  private void inbox() {
    title("Already here.");
    paragraph(prefs.p.getString("status", "Connect to receive your first items."));
    body.addView(
        button(
            ReceiveService.active ? "Refresh inbox" : "Start live receiving",
            () -> {
              if (!ReceiveService.active) startLive();
              sync(true);
            }));
    body.addView(text("ON THIS PHONE", 12, muted));
    try (LocalStore db = new LocalStore(this)) {
      List<JSONObject> items = db.items(null);
      if (items.isEmpty())
        paragraph("Send something to 9t. It will appear here, even after you go offline.");
      for (JSONObject item : items) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(12), dp(16), dp(12));
        card.setBackground(shape(paper, 18));
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(-1, -2);
        cp.setMargins(0, dp(7), 0, dp(7));
        body.addView(card, cp);
        card.addView(
            text(
                item.getString("type").toUpperCase()
                    + " · "
                    + item.getString("status").toUpperCase(),
                11,
                green));
        TextView name = text(item.getString("name"), 18, ink);
        name.setTypeface(null, Typeface.BOLD);
        card.addView(name);
        String preview =
            item.optString(
                "content", item.optString("url", item.optLong("sizeBytes") / 1024 + " KB"));
        TextView p = text(preview, 14, muted);
        p.setMaxLines(3);
        card.addView(p);
        if (item.has("error"))
          card.addView(text(item.getString("error"), 13, Color.rgb(151, 61, 45)));
        boolean saved = item.optString("status").equals("saved");
        String label =
            saved
                ? (item.optString("type").equals("file") ? "Open file" : "View & copy")
                : "Receive this item";
        card.addView(
            button(
                label,
                () -> {
                  if (saved) openItem(item);
                  else {
                    try (LocalStore writable = new LocalStore(this)) {
                      writable.update(item.optString("id"), "status", "pending");
                    }
                    sync(true);
                  }
                }));
      }
    } catch (Exception e) {
      paragraph("Could not load local inbox: " + e.getMessage());
    }
  }

  private void openItem(JSONObject item) {
    if (item.optString("type").equals("file")) {
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
      new AlertDialog.Builder(this)
          .setTitle(item.optString("name"))
          .setView(scroll)
          .setPositiveButton(
              "Copy text",
              (d, w) -> {
                try {
                  getSystemService(ClipboardManager.class)
                      .setPrimaryClip(ClipData.newPlainText("9t", item.optString("content")));
                  toast("Copied as text");
                } catch (RuntimeException e) {
                  toast(
                      "Android could not copy this snippet. Select a smaller portion of the text.");
                }
              })
          .setNegativeButton("Close", null)
          .show();
    }
  }

  private void send() {
    title("Send it over.");
    paragraph(
        "Text queues on this phone and sends when a route is available. For files, links, and all"
            + " other tools, use Workspace.");
    EditText compose = field("A thought, a command, a little bit of code…", "", true);
    compose.setTag("compose");
    compose.setMinLines(7);
    body.addView(
        button(
            "Paste clipboard",
            () -> {
              ClipboardManager cm = getSystemService(ClipboardManager.class);
              if (cm.hasPrimaryClip() && cm.getPrimaryClip() != null)
                compose.setText(cm.getPrimaryClip().getItemAt(0).coerceToText(this));
            }));
    body.addView(
        button(
            "Send to 9t",
            () -> {
              String content = compose.getText().toString();
              if (content.isBlank() || content.length() > 100000) {
                toast("Enter between 1 and 100,000 characters.");
                return;
              }
              try (LocalStore db = new LocalStore(this)) {
                db.enqueue(content);
              }
              compose.setText("");
              toast("Queued on this phone");
              sync(true);
            }));
    try (LocalStore db = new LocalStore(this)) {
      List<JSONObject> queue = db.outbox();
      body.addView(text("OUTBOX · " + queue.size(), 12, muted));
      for (JSONObject item : queue) {
        String value = item.getString("content");
        paragraph(
            value.substring(0, Math.min(100, value.length()))
                + (item.has("error") ? "\n" + item.optString("error") : "\nWaiting to send"));
        body.addView(
            button(
                "Remove queued text",
                () -> {
                  try (LocalStore queued = new LocalStore(this)) {
                    queued.sent(item.optString("id"));
                  }
                  render();
                }));
      }
    } catch (Exception e) {
      paragraph("Could not load outbox");
    }
  }

  private void toggle(String label, String key, boolean fallback) {
    Switch sw = new Switch(this);
    sw.setText(label);
    sw.setTextColor(ink);
    sw.setPadding(0, dp(14), 0, dp(14));
    sw.setChecked(prefs.p.getBoolean(key, fallback));
    sw.setOnCheckedChangeListener((b, value) -> prefs.p.edit().putBoolean(key, value).apply());
    body.addView(sw);
  }

  private void settings() {
    title("Stay connected.");
    Switch theme = new Switch(this);
    theme.setText("Dark theme");
    theme.setTextColor(ink);
    theme.setPadding(0, dp(8), 0, dp(14));
    theme.setChecked(prefs.p.getBoolean("darkTheme", false));
    theme.setOnCheckedChangeListener(
        (button, value) -> {
          prefs.p.edit().putBoolean("darkTheme", value).apply();
          applyTheme();
          render();
        });
    body.addView(theme);
    paragraph(prefs.p.getString("status", "Ready to connect"));
    paragraph(
        "Auto prefers LAN, switches to internet on failure, and checks LAN again. Both addresses"
            + " must reach the same paired server.");
    body.addView(text("LAN ADDRESS", 12, muted));
    EditText lan = field("http://192.168.1.20:3265", prefs.p.getString("lan", ""), false);
    body.addView(text("PUBLIC ADDRESS", 12, muted));
    EditText remote = field("https://9t.example.com", prefs.p.getString("public", ""), false);
    Spinner mode = new Spinner(this);
    String[] labels = {"Automatic · LAN first", "LAN only", "Internet only"};
    mode.setAdapter(
        new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, labels));
    String current = prefs.p.getString("mode", "auto");
    mode.setSelection(current.equals("lan") ? 1 : current.equals("public") ? 2 : 0);
    body.addView(mode);
    body.addView(
        button(
            "Save connection",
            () -> {
              try {
                String l = Endpoint.validate(lan.getText().toString(), true),
                    r = Endpoint.validate(remote.getText().toString(), false);
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
    toggle("Automatically save incoming files", "files", true);
    toggle("Copy incoming snippets to clipboard", "copy", true);
    toggle("Files: unmetered connections only", "wifiOnly", false);
    EditText max =
        field("Automatic file limit (MB)", String.valueOf(prefs.p.getLong("maxMb", 500)), false);
    max.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
    body.addView(
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
    body.addView(button("Start live receiving", this::startLive));
    body.addView(text("BACKGROUND RECEIVING · 9t " + ReceiverDiagnostics.version(this), 12, green));
    receiverStatus = text(ReceiverDiagnostics.summary(this), 14, muted);
    body.addView(receiverStatus);
    batteryStatus = text(backgroundStatus(), 14, muted);
    body.addView(batteryStatus);
    body.addView(button("Allow background receiving", this::requestBackgroundAccess));
    body.addView(button("Phone app settings", this::openAppSettings));
    paragraph(
        "Allow background receiving in Android's prompt so files can arrive while the screen is"
            + " off. On Tecno/HiOS, also allow background activity and auto-start in Phone app"
            + " settings if offered. Live receiving uses extra battery.");
    body.addView(button("Receiver details", this::showReceiverDetails));
    body.addView(
        button(
            "Pause all receiving",
            () -> {
              prefs.p.edit().putBoolean("enabled", false).apply();
              stopService(new Intent(this, ReceiveService.class));
              SyncJob.cancel(this);
              prefs.status("Receiving paused");
              render();
            }));
    body.addView(
        button(
            "Notification settings",
            () ->
                startActivity(
                    new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()))));
    paragraph(
        "With a LAN address and Automatic or LAN-only mode, receiving keeps the connection to your"
            + " computer active until you pause it, including after a restart. Internet-only"
            + " receiving uses a five-hour live session, then scheduled checks. The notification"
            + " shows the last successful connection time. Force-stop and phone battery controls"
            + " can still stop receiving.");
    paragraph(
        "Transfers are encrypted even on HTTP LAN routes. The full Workspace screen requires HTTPS."
            + " LAN-only use needs a server on your local network; a cloud server still needs"
            + " internet or a reachable private route.");
    body.addView(
        button(
            "Disconnect this phone",
            () ->
                new AlertDialog.Builder(this)
                    .setTitle("Disconnect phone?")
                    .setMessage(
                        "Local history and queued text will be cleared. Downloaded files stay in"
                            + " Downloads/9t. Revoke this phone from the website's device settings"
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
        getSystemService(PowerManager.class).isIgnoringBatteryOptimizations(getPackageName());
    boolean restricted = getSystemService(ActivityManager.class).isBackgroundRestricted();
    return (exempt
            ? "Android background battery access: allowed."
            : "Android background battery access: restricted. Tap Allow background receiving.")
        + (restricted ? " Background activity is also restricted in Phone app settings." : "");
  }

  private void offerBackgroundAccess() {
    if (prefs.p.getBoolean("backgroundPromptV3", false)
        || getSystemService(PowerManager.class).isIgnoringBatteryOptimizations(getPackageName()))
      return;
    prefs.p.edit().putBoolean("backgroundPromptV3", true).apply();
    new AlertDialog.Builder(this)
        .setTitle("Receive in the background")
        .setMessage(
            "Allow 9t to receive files and text while another app is open or the screen is locked."
                + " Android will ask to allow background battery use. This uses extra battery.")
        .setPositiveButton("Continue", (d, w) -> requestBackgroundAccess())
        .setNegativeButton("Later", null)
        .show();
  }

  private void requestBackgroundAccess() {
    if (getSystemService(PowerManager.class).isIgnoringBatteryOptimizations(getPackageName())) {
      if (getSystemService(ActivityManager.class).isBackgroundRestricted()) openAppSettings();
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
    new AlertDialog.Builder(this)
        .setTitle("Receiver details")
        .setView(scroll)
        .setPositiveButton(
            "Copy details",
            (d, w) -> {
              getSystemService(ClipboardManager.class)
                  .setPrimaryClip(ClipData.newPlainText("9t receiver details", report));
              toast("Receiver details copied");
            })
        .setNegativeButton("Close", null)
        .show();
  }

  private void ensureLive() {
    SyncJob.schedule(this);
    try {
      startForegroundService(
          new Intent(this, ReceiveService.class).setAction(ReceiveService.START));
    } catch (Exception e) {
      ReceiverDiagnostics.error(this, e);
      toast(
          "Android could not start live receiving. Open the app again; scheduled sync remains"
              + " enabled.");
    }
  }

  private void requestNotifications() {
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
    prefs.p.edit().putBoolean("enabled", false).commit();
    stopService(new Intent(this, ReceiveService.class));
    SyncJob.cancel(this);
    io.execute(
        () -> {
          while (SyncEngine.running.get()) {
            try {
              Thread.sleep(100);
            } catch (InterruptedException e) {
              return;
            }
          }
          try (LocalStore db = new LocalStore(this)) {
            db.clear();
          }
          java.io.File dir = new java.io.File(getFilesDir(), "transfers");
          java.io.File[] files = dir.listFiles();
          if (files != null) for (java.io.File f : files) f.delete();
          prefs.p.edit().clear().commit();
          runOnUiThread(
              () -> {
                CookieManager.getInstance().removeAllCookies(null);
                CookieManager.getInstance().flush();
                WebStorage.getInstance().deleteAllData();
                render();
              });
        });
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
              if (!route.url.startsWith("https://")) continue;
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
                  CookieManager.getInstance()
                      .setCookie(
                          selected,
                          "9t_session="
                              + token
                              + "; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600",
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
                                    getSystemService(DownloadManager.class).enqueue(r);
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

  private void toast(String value) {
    Toast.makeText(this, value == null ? "Please try again" : value, Toast.LENGTH_LONG).show();
  }
}
