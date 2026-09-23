import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link className={styles.brand} href="/" aria-label="9t workspace">
          <img src="/9t-mark.svg" alt="" width={48} height={36} />
          <span>9t</span>
        </Link>
        <div className={styles.content}>
          <span className={styles.code}>404 / PAGE NOT FOUND</span>
          <h1>Nothing at this address.</h1>
          <p>The page may have moved, or the address may be wrong.</p>
          <Link className={styles.action} href="/">Back to workspace</Link>
        </div>
        <span className={styles.footnote}>SELF-HOSTED WORKSPACE</span>
      </div>
    </main>
  );
}
