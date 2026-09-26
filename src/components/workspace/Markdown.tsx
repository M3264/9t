import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./Markdown.module.css";

export default function Markdown({ source }: { source: string }) {
  return <div className={styles.markdown}><ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown></div>;
}
