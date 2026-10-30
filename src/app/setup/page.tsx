import { redirect } from "next/navigation";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { getSession } from "@/lib/workspace";
import SetupForm from "./setup-form";

export default async function SetupPage() {
  if (!supabaseConfigured()) redirect("/login");
  const { data: { user } } = await (await supabase()).auth.getUser();
  if (!user) redirect("/login");
  if (await getSession()) redirect("/");
  return <SetupForm />;
}
