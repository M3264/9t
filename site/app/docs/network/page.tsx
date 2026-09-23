import { DocRoute, docMeta } from "../../../components/doc-page";
export async function generateMetadata() { return docMeta("network"); }
export default function Page() { return <DocRoute slug="network" />; }
