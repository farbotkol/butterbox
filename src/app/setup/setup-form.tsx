"use client";

import { useState, useTransition } from "react";
import { bootstrapAction, logoutAction } from "../actions";

export default function SetupForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return <main className="mx-auto max-w-lg p-8">
    <h1 className="text-3xl font-semibold">Welcome to Butterbox</h1>
    <p className="my-6">Your account is authenticated but has no business membership. Ask your administrator
      to provision access, or create a fictional Little Wattle Café workspace to try the roster.</p>
    <p className="my-6">The sample contains 24 fictional employees. It is not a real business onboarding or billing flow.</p>
    {error && <p role="alert">{error}</p>}
    <button className="rounded bg-emerald-950 px-4 py-3 text-white" disabled={pending}
      onClick={() => start(async () => { const result = await bootstrapAction(); setError(result.error ?? ""); })}>
      {pending ? "Creating…" : "Create fictional café"}
    </button>
    <form action={logoutAction} className="mt-4"><button className="underline">Sign out</button></form>
  </main>;
}
