type ShowcaseConfig = {
  flag?: string;
  apiUrl?: string;
  appUrl?: string;
  publicFlag?: string;
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

export function publicShowcaseMode(config: ShowcaseConfig): boolean {
  const showcase = showcaseMode(config);
  if (config.publicFlag === undefined || config.publicFlag === "false") return false;
  if (config.publicFlag !== "true" || !showcase) {
    throw new Error("Public showcase mode requires the verified synthetic showcase configuration.");
  }
  return true;
}

function runtimeShowcaseConfig(): ShowcaseConfig {
  return {
    flag: process.env.NEXT_PUBLIC_BUTTERBOX_SHOWCASE,
    apiUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    appUrl: process.env.NEXT_PUBLIC_SITE_URL,
    publicFlag: process.env.NEXT_PUBLIC_BUTTERBOX_PUBLIC_SHOWCASE,
  };
}

export function isShowcase(): boolean {
  return showcaseMode(runtimeShowcaseConfig());
}

export function isPublicShowcase(): boolean {
  return publicShowcaseMode(runtimeShowcaseConfig());
}

export function supabaseAuthCookieOptions(
  config: ShowcaseConfig = runtimeShowcaseConfig(),
): { name: string; secure?: boolean; httpOnly?: boolean } | undefined {
  if (!showcaseMode(config)) {
    publicShowcaseMode(config);
    return undefined;
  }
  return publicShowcaseMode(config)
    ? { name: SHOWCASE_AUTH_COOKIE_NAME, secure: true, httpOnly: true }
    : { name: SHOWCASE_AUTH_COOKIE_NAME };
}

export function supabaseAuthCookieName(url: string, config: ShowcaseConfig = runtimeShowcaseConfig()): string {
  return supabaseAuthCookieOptions(config)?.name ?? `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}
