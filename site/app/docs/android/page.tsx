import { DocRoute, docMeta } from "../../../components/doc-page";
export async function generateMetadata() { return docMeta("android"); }
export default function Page() { return <DocRoute slug="android" />; }
