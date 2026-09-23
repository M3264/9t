import DocPage, { docMeta } from "../../../components/doc-page";
export async function generateMetadata() { return docMeta("operations"); }
export default function Page() { return <DocPage slug="operations" />; }
