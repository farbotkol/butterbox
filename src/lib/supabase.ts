import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function supabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export async function supabase() {
  const jar = await cookies();
  if (!supabaseConfigured()) throw new Error("Supabase is not configured.");
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" },
      cookies: {
        getAll: () => jar.getAll(),
        setAll: values => {
          try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); }
          catch { /* Server components cannot set cookies; proxy refreshes sessions. */ }
        },
      },
    },
  );
}
