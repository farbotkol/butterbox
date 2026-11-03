type ShowcaseConfig = {
  flag?: string;
  apiUrl?: string;
  appUrl?: string;
};

export const SHOWCASE_AUTH_COOKIE_NAME = "sb-butterbox-showcase-auth-token";

export function showcaseMode(config: ShowcaseConfig): boolean {
  if (config.flag === undefined || config.flag === "false") {
    if (config.apiUrl === "http://127.0.0.1:57421" || config.appUrl === "http://127.0.0.1:3137") {
      throw new Error("Showcase origins require explicit simulation labeling.");
    }
    return false;
  }
  if (config.flag !== "true" || config.apiUrl !== "http://127.0.0.1:57421" ||
      config.appUrl !== "http://127.0.0.1:3137") {
    throw new Error("Showcase labeling requires the verified local showcase API and app origins.");
  }
  return true;
}

function runtimeShowcaseConfig(): ShowcaseConfig {
  return {
    flag: process.env.NEXT_PUBLIC_BUTTERBOX_SHOWCASE,
    apiUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    appUrl: process.env.NEXT_PUBLIC_SITE_URL,
  };
}

export function isShowcase(): boolean {
  return showcaseMode(runtimeShowcaseConfig());
}

export function supabaseAuthCookieOptions(config: ShowcaseConfig = runtimeShowcaseConfig()): { name: string } | undefined {
  return showcaseMode(config) ? { name: SHOWCASE_AUTH_COOKIE_NAME } : undefined;
}

export function supabaseAuthCookieName(url: string, config: ShowcaseConfig = runtimeShowcaseConfig()): string {
  return supabaseAuthCookieOptions(config)?.name ?? `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}
