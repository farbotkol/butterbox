import { redirect } from "next/navigation";
import LoginForm from "@/components/login-form";
import { demoEnabled } from "@/lib/demo-store";
import { getSession } from "@/lib/workspace";

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  return <LoginForm demo={demoEnabled()} />;
}
