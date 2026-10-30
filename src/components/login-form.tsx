"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Check, Layers3, LoaderCircle } from "lucide-react";
import { loginAction } from "@/app/actions";
import type { ActionResult } from "@/lib/domain";

export default function LoginForm({ demo }: { demo: boolean }) {
  const [result, action, pending] = useActionState<ActionResult, FormData>(loginAction, {});
  return (
    <main className="login-page">
      <section className="login-story">
        <Link href="/" className="brand"><span className="brand-mark"><Layers3 size={22} /></span>butterbox<span className="brand-period">.</span></Link>
        <div className="login-pitch"><span className="eyebrow">LESS ADMIN. MORE HOSPITALITY.</span><h1>A better week<br />starts here.</h1><p>Your people, your places, your plans.<br />Finally, all on the same page.</p>
          <div className="login-preview"><div className="preview-icon"><CalendarDays size={28} /></div><div><strong>Good shifts. Great teams.</strong><p>A little organisation goes a long way.</p></div><span className="round-check"><Check size={18} /></span></div>
        </div>
        <p className="login-foot">Made for the people who make hospitality happen.</p>
      </section>
      <section className="login-panel">
        <div className="login-card"><span className="eyebrow">YOUR WORKING WEEK, SORTED</span><h2>Welcome back.</h2><p className="muted">Sign in and let&apos;s get the week running smoothly.</p>
          <form action={action} className="login-form">
            <label>Email address<input name="email" type="email" autoComplete="username" placeholder="you@yourvenue.com" required disabled={pending} /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required disabled={pending} /></label>
            {result.error && <p className="notice error" role="alert">{result.error}</p>}
            {result.success && <p className="notice success" role="status">{result.success}</p>}
            <button className="button primary wide" disabled={pending}>{pending ? <LoaderCircle size={18} className="spin" /> : <>Sign in <ArrowRight size={17} /></>}</button>
          </form>
          {demo && <div className="demo-accounts"><strong>Take a look around</strong><p>Choose an account to explore the demo.</p><div className="demo-buttons">{[["Owner", "owner"], ["FOH manager", "foh"], ["BOH manager", "boh"], ["Employee", "employee"]].map(([label, account]) => <form action={action} key={account}><input type="hidden" name="email" value={`${account}@demo.butterbox.test`} /><input type="hidden" name="password" value="butterbox-demo" /><button className="button secondary" disabled={pending}>{label}<ArrowRight size={14} /></button></form>)}</div><details><summary>Demo credentials</summary><p>Use owner, foh, boh, or employee @demo.butterbox.test.<br />Password: <code>butterbox-demo</code></p></details></div>}
          <p className="login-help">Need access? Ask your workspace administrator.<br />An internet connection is required.</p>
        </div>
      </section>
    </main>
  );
}
