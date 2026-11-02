type ShowcaseConfig = {
  flag?: string;
  apiUrl?: string;
  appUrl?: string;
};

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

export function isShowcase(): boolean {
  return showcaseMode({
    flag: process.env.NEXT_PUBLIC_BUTTERBOX_SHOWCASE,
    apiUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    appUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });
}
