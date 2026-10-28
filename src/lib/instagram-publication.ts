const INSTAGRAM_REFERENCE_MAX_LENGTH = 500;
const INSTAGRAM_PATH_PATTERN = /^\/(p|reel|tv)\/([A-Za-z0-9_-]{5,64})\/?$/u;

export function normalizeInstagramPublicationReference(
  input: string | undefined,
): string | null | undefined {
  const value = input?.trim();

  if (!value) {
    return undefined;
  }
  if (value.length > INSTAGRAM_REFERENCE_MAX_LENGTH) {
    return null;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const match = INSTAGRAM_PATH_PATTERN.exec(url.pathname);

    if (
      url.protocol !== "https:" ||
      (hostname !== "instagram.com" && hostname !== "www.instagram.com") ||
      url.username ||
      url.password ||
      url.port ||
      !match
    ) {
      return null;
    }

    const [, kind, shortcode] = match;
    return `https://www.instagram.com/${kind}/${shortcode}/`;
  } catch {
    return null;
  }
}
