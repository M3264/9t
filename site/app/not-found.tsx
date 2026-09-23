import Link from "next/link";
import { SiteFooter, SiteHeader } from "../components/chrome";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className={styles.main} id="main">
        <div className={styles.content}>
          <span className={styles.code}>404 <span aria-hidden="true">·</span> PAGE NOT FOUND</span>
          <h1>This page isn&apos;t here.</h1>
          <p>The link may have changed, or the address may be mistyped.</p>
          <div className={styles.actions}>
            <Link className="primarybtn" href="/">Go to homepage</Link>
            <Link className="ghostbtn" href="/docs/">Browse docs</Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
