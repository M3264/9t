import DocPage, { docMeta } from "../../../components/doc-page";
export async function generateMetadata() { return docMeta("install"); }
export default function Page() { return <DocPage slug="install" />; }
