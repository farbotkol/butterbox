type AuthDestination = "/setup" | "/reset-password";

export function authCallbackUrl(
  siteUrl: string | undefined,
  next: AuthDestination,
): string | null {
  if (!siteUrl || !URL.canParse(siteUrl)) return null;

  const site = new URL(siteUrl);
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(site.hostname);
  if (
    (site.protocol !== "https:" && !(site.protocol === "http:" && localHost)) ||
    site.username ||
    site.password ||
    site.pathname !== "/" ||
    site.search ||
    site.hash
  ) {
    return null;
  }

  const callback = new URL("/auth/callback", site);
  callback.searchParams.set("next", next);
  return callback.toString();
}

export function safeAuthRedirect(next: string | null): string {
  const base = "https://auth-redirect.invalid";
  if (!next?.startsWith("/") || next.startsWith("//") || !URL.canParse(next, base)) {
    return "/";
  }

  const target = new URL(next, base);
  if (target.origin !== base || target.pathname.startsWith("//")) return "/";
  return `${target.pathname}${target.search}${target.hash}`;
}
