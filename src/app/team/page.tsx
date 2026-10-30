import Workspace from "@/components/workspace";
import { getAppData } from "@/lib/workspace";

export default async function TeamPage() {
  return <Workspace data={await getAppData()} initialView="team" />;
}
