import { DocRoute, docMeta } from "../../../components/doc-page";
export async function generateMetadata() { return docMeta("api"); }
export default function Page() { return <DocRoute slug="api" />; }
