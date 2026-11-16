type DemoDataEnvironment = Record<string, string | undefined>;

const projectRefPattern = /^[a-z0-9][a-z0-9-]{2,62}$/;

export function demoDataProjectRef(environment: DemoDataEnvironment): string | null {
  const projectRef = environment.BUTTERBOX_DEMO_DATA_PROJECT_REF;
  if (
    environment.BUTTERBOX_DEMO_DATA_ENABLED !== "true" ||
    environment.BUTTERBOX_DEMO_DATA_ENVIRONMENT !== "development" ||
    !projectRefPattern.test(projectRef ?? "")
  ) {
    return null;
  }

  const vercelEnvironment = environment.VERCEL_ENV;
  if (
    vercelEnvironment
      ? !["preview", "development"].includes(vercelEnvironment)
      : environment.NODE_ENV !== "development"
  ) {
    return null;
  }

  try {
    const url = new URL(environment.NEXT_PUBLIC_SUPABASE_URL ?? "");
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      return null;
    }

    if (url.protocol === "https:" && url.hostname === `${projectRef}.supabase.co` && !url.port) {
      return projectRef;
    }
    if (
      !vercelEnvironment &&
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      Boolean(url.port)
    ) {
      return projectRef;
    }
  } catch {
    return null;
  }

  return null;
}
