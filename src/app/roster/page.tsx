import Workspace from "@/components/workspace";
import { getAppData } from "@/lib/workspace";

export default async function RosterPage() {
  return <Workspace data={await getAppData()} initialView="roster" />;
}
