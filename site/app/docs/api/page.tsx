import DocPage, { docMeta } from "../../../components/doc-page";
export async function generateMetadata() { return docMeta("api"); }
export default function Page() { return <DocPage slug="api" />; }
