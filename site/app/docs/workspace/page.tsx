import { DocRoute, docMeta } from "../../../components/doc-page";
export async function generateMetadata() { return docMeta("workspace"); }
export default function Page() { return <DocRoute slug="workspace" />; }
