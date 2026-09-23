import { DocRoute, docMeta } from "../../../components/doc-page";
export async function generateMetadata() { return docMeta("sharing"); }
export default function Page() { return <DocRoute slug="sharing" />; }
