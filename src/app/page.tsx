import Workspace from "@/components/workspace";
import { getAppData } from "@/lib/workspace";

export default async function Home() {
  return <Workspace data={await getAppData()} initialView="dashboard" />;
}
