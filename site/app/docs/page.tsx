import { DocRoute, docMeta } from "../../components/doc-page";
export async function generateMetadata() { return docMeta("index"); }
export default function Page() { return <DocRoute slug="index" />; }
