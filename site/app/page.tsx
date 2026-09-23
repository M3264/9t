import { SiteHeader, SiteFooter } from "../components/chrome";

const features = [
  { k: "CAPTURE", h: "One inbox", p: "Paste text, links, screenshots, and files into the same capture flow. The inbox classifies it — you never pick a type first." },
  { k: "STORAGE", h: "Your server", p: "Data stays in storage you choose, with opaque file keys and atomic writes. No third-party workspace in the middle." },
  { k: "HANDOFF", h: "LAN-first handoff", p: "The Android client prefers the local network, falls back to the internet route, and reconnects in the background." },
  { k: "SHARING", h: "Share with control", p: "Expiring, optional-password public handoffs with access counts and revocation." },
  { k: "PHONE", h: "Phone sync", p: "Encrypted persistent connection, background receiving, Downloads/9t auto-save, HTTP catch-up fallback." },
  { k: "SAFETY", h: "Private by default", p: "Auth is mandatory in every mode. No public-without-auth state can exist." },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="main" id="main">
        <div className="hero">
          <div>
            <span className="eyebrow">SELF-HOSTED · LAN-FIRST · SINGLE OWNER</span>
            <h1>
              Put it in 9t. <span className="accent">Get it anywhere</span> — on your terms.
            </h1>
            <p>
              A quiet workspace for moving the things you need between your devices.
              Files, snippets, links, handoffs, phone sync — without routing your
              life through someone else&apos;s cloud.
            </p>
            <div className="cta-row">
              <a className="primarybtn" href="/docs/">
                Read the docs
              </a>
              <a className="ghostbtn" href="https://github.com/M3264/9t/releases/download/v0.6.2/9t-android-0.6.2.apk">
                Download Android
              </a>
              <a className="ghostbtn" href="https://github.com/M3264/9t">
                GitHub
              </a>
            </div>
            <p className="meta">
              Free software (GPL-3.0) · Node.js 22+ is the only requirement ·{" "}
              <code>./setup.sh</code> builds, configures, and can install a boot service.
            </p>
          </div>
          <div className="mock" aria-hidden="true">
            <div className="mock-bar">
              <span className="mock-logo">9t</span>
              <span className="mock-search">Search files, snippets, links…</span>
            </div>
            <div className="mock-tabs">
              <span className="on">All</span>
              <span>Snippets</span>
              <span>Files</span>
              <span>Links</span>
            </div>
            <div className="mock-stick">
              + Quick stick<small>Stick a thought, command, code…</small>
            </div>
            <div className="mock-item">
              <span>SNIPPET · SH</span>
              <code>9t push deploy.sh --name deploy</code>
              <span>2m ago · Copy</span>
            </div>
            <div className="mock-item">
              <span>FILE · 2.4 MB</span>
              <b>photos.zip</b>
              <span>LAN → phone · Grab</span>
            </div>
            <div className="mock-item">
              <span>LINK · 1D LEFT</span>
              <b>cool-paper.pdf</b>
              <span>Shared · Open</span>
            </div>
            <div className="mock-note">Beamed to phone · saved in Downloads/9t</div>
          </div>
        </div>

        <section className="section" aria-label="Features">
          <h2>Why 9t</h2>
          <p className="sub">Six promises, kept small on purpose.</p>
          <div className="cards">
            {features.map((f) => (
              <div className="card" key={f.h}>
                <span className="k">{f.k}</span>
                <h3>{f.h}</h3>
                <p>{f.p}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section" aria-label="Who is 9t for">
          <h2>It reshapes into what you need</h2>
          <p className="sub">
            Snippets, Files, Links, Board — each a toggleable module. 9t becomes
            exactly your mix, nothing more.
          </p>
          <div className="cards">
            <div className="card">
              <span className="k">01</span>
              <h3>Dev snippet-mover</h3>
              <p>
                Move code, config, and commands between machines. CLI-first,
                syntax highlighted. <code>9t push</code> it here, <code>9t get</code> it there.
              </p>
            </div>
            <div className="card">
              <span className="k">02</span>
              <h3>Dropbox replacement</h3>
              <p>
                Files between phone, server, and laptop. QR handoff, download
                links, auto-save to <code>Downloads/9t</code>.
              </p>
            </div>
            <div className="card">
              <span className="k">03</span>
              <h3>Personal dashboard</h3>
              <p>
                One homepage for your own links and notes instead of scattered
                apps. Toggleable Board over your objects.
              </p>
            </div>
          </div>
        </section>

        <section className="section" aria-label="Quick start">
          <h2>Running in minutes</h2>
          <p className="sub">The wizard asks, builds, and optionally installs a boot service.</p>
          <div className="term">
            <div className="term-bar">
              <i />
              <i />
              <i />
              <span>terminal</span>
            </div>
            <pre>{`$ git clone https://github.com/M3264/9t.git
$ cd 9t
$ ./setup.sh
? Access: lan — reachable by your phone over Wi-Fi
✓ Built · admin created · service installed
$ ./9t start`}</pre>
          </div>
          <div className="cta-row">
            <a className="primarybtn" href="/docs/install/">
              Full install guide
            </a>
            <a className="ghostbtn" href="/docs/android/">
              Pair your phone
            </a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
