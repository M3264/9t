import { DocRoute, docMeta } from "../../../components/doc-page";
export async function generateMetadata() { return docMeta("principles"); }
export default function Page() { return <DocRoute slug="principles" />; }
