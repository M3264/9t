import { SiteFooter, SiteHeader } from "../components/chrome";

const repo = "https://github.com/M3264/9t";
const android = `${repo}/releases/download/v0.6.3/9t-android-0.6.3.apk`;

const steps = [
  { n: "01", title: "Capture", text: "Paste text or a link, drag in a file, or push an item from the CLI. They all land in the same inbox.", tags: "Text · links · screenshots · files" },
  { n: "02", title: "Find", text: "Search your items, pin the ones you use often, and organize them in collections.", tags: "Search · collections · quick access" },
  { n: "03", title: "Transfer", text: "Send an item to Android, fetch it from another computer, or create an expiring share link.", tags: "Android · CLI · sharing links" },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="main landing" id="main">
        <section className="landing-hero" aria-labelledby="hero-title">
          <div className="landing-hero-copy">
            <span className="landing-kicker"><span className="status-dot" /> FILES · SNIPPETS · LINKS</span>
            <h1 id="hero-title">Move files and snippets <em>between your devices.</em></h1>
            <p>Save files, links, and text on your own 9t server. Find them in the browser, fetch them from the CLI, or send them to Android.</p>
            <div className="landing-actions">
              <a className="primarybtn landing-primary" href="/docs/install/">Install 9t <span aria-hidden="true">↗</span></a>
              <a className="landing-link" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a>
            </div>
            <div className="landing-trust"><span>Self-hosted</span><span>Open source</span><span>LAN first</span></div>
          </div>
          <div className="landing-preview" aria-label="Illustration of the 9t workspace">
            <div className="preview-window">
              <div className="preview-chrome"><b>9t<span>.</span></b><span>9t / workspace</span><i>K</i></div>
              <div className="preview-content">
                <div className="preview-heading"><div><small>ALL ITEMS</small><strong>Recent items</strong></div><span>＋</span></div>
                <div className="preview-search">⌕ <span>Search items</span><kbd>⌘ K</kbd></div>
                <div className="preview-filters"><b>All</b><span>Snippets</span><span>Files</span><span>Links</span></div>
                <div className="preview-items">
                  <div className="preview-item"><span className="preview-item-icon">{'{ }'}</span><div><small>SNIPPET</small><strong>deploy command</strong><span>docker compose up -d</span></div><i>↗</i></div>
                  <div className="preview-item"><span className="preview-item-icon file">↧</span><div><small>FILE</small><strong>weekend-photos.zip</strong><span>Ready on your devices</span></div><i>↗</i></div>
                  <div className="preview-item"><span className="preview-item-icon link">↗</span><div><small>LINK</small><strong>reference article</strong><span>Saved yesterday</span></div><i>↗</i></div>
                </div>
              </div>
            </div>
            <div className="preview-received"><span>↓</span><div><b>Sent to your phone</b><small>Saved in Downloads/9t</small></div></div>
          </div>
        </section>

        <section className="landing-section" id="how-it-works" aria-labelledby="how-title">
          <div className="landing-section-head"><div><span className="section-label">HOW IT WORKS</span><h2 id="how-title">Save once. Use it on <em>another device.</em></h2></div><p>The browser, CLI, and Android client work with the same 9t instance.</p></div>
          <div className="landing-steps">{steps.map((step) => <article className="landing-step" key={step.n}><span className="step-number">{step.n}</span><h3>{step.title}</h3><p>{step.text}</p><small>{step.tags}</small></article>)}</div>
        </section>

        <section className="landing-control" aria-labelledby="control-title">
          <div><span className="section-label">HOSTING AND ACCESS</span><h2 id="control-title">Run 9t on <em>your server.</em></h2><p>Choose where it runs and where its data lives. Sign-in is always required. Share links can expire, use a password, and be revoked whenever you want.</p><a href="/docs/install/">Set up your server <span aria-hidden="true">↗</span></a></div>
          <div className="control-diagram" aria-hidden="true"><span>YOUR DEVICES</span><i /><strong>9t<small>YOUR SERVER</small></strong><i /><span>YOUR STORAGE</span><small>LOCAL WHEN POSSIBLE · ENCRYPTED HANDOFF</small></div>
        </section>

        <section className="landing-phone" aria-labelledby="phone-title">
          <div className="phone-art" aria-hidden="true"><div className="phone-screen"><div className="phone-top"><b>9t</b><span>● Connected</span></div><small>RECENTLY RECEIVED</small><div className="phone-file"><span>↧</span><div><b>weekend-photos.zip</b><small>Saved to Downloads/9t</small></div></div><div className="phone-file"><span>{'{ }'}</span><div><b>deploy command</b><small>Ready to copy</small></div></div><div className="phone-nav"><span>Home</span><span>Send</span><span>Connect</span></div></div></div>
          <div className="phone-copy"><span className="section-label">ANDROID</span><h2 id="phone-title">Receive files <em>on your phone.</em></h2><p>The Android client can receive in the background, save files to Downloads/9t, and prefer your local network before falling back to your public route.</p><div className="landing-actions"><a className="primarybtn" href={android}>Download Android <span aria-hidden="true">↗</span></a><a className="landing-link" href="/docs/android/">How pairing works <span aria-hidden="true">↗</span></a></div></div>
        </section>

        <section className="landing-start" aria-labelledby="start-title"><div><span className="section-label">INSTALLATION</span><h2 id="start-title">Install 9t <em>on your machine.</em></h2><p>Run the setup wizard, choose local, LAN, or public access, and create your account.</p><div className="landing-actions"><a className="primarybtn" href="/docs/install/">Read the install guide <span aria-hidden="true">↗</span></a><a className="landing-link" href={repo}>View on GitHub <span aria-hidden="true">↗</span></a></div></div><div className="start-terminal"><div className="term-bar"><i /><i /><i /><span>terminal</span></div><pre><span>$</span> git clone https://github.com/M3264/9t.git<br /><span>$</span> cd 9t<br /><span>$</span> ./setup.sh</pre><small>Node.js 22+ · GPL-3.0</small></div></section>
      </main>
      <SiteFooter />
    </>
  );
}
