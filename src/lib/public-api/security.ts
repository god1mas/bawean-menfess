import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { isIP } from "node:net";
import type {
  RateLimitScope,
  TrackingCredentialPair,
} from "@/lib/public-api/contracts";

const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TRACKING_CODE_PATTERN =
  /^BM-[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){4}$/u;
const TRACKING_URL_TOKEN_PATTERN = /^bmu_[A-Za-z0-9_-]{43}$/u;
const HMAC_KEY_VERSION = 1;

export type D2Environment = {
  NODE_ENV?: string;
  VERCEL?: string;
  TRACKING_CODE_HMAC_KEY_V1?: string;
  TRACKING_URL_HMAC_KEY_V1?: string;
  RATE_LIMIT_IDENTIFIER_HMAC_KEY_V1?: string;
  BETTER_AUTH_SECRET?: string;
};

function requiredHmacKey(value: string | undefined, name: string) {
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    throw new Error(`${name} must contain at least 32 bytes.`);
  }

  return Buffer.from(value, "utf8");
}

function fingerprint(value: Buffer) {
  return createHash("sha256").update(value).digest();
}

function assertIndependentSecrets(secrets: Array<[string, Buffer]>) {
  for (let outer = 0; outer < secrets.length; outer += 1) {
    for (let inner = outer + 1; inner < secrets.length; inner += 1) {
      const first = secrets[outer];
      const second = secrets[inner];

      if (!first || !second) {
        continue;
      }

      if (timingSafeEqual(fingerprint(first[1]), fingerprint(second[1]))) {
        throw new Error(`${first[0]} and ${second[0]} must be independent.`);
      }
    }
  }
}

export function loadD2Secrets(environment: D2Environment = process.env) {
  const trackingCodeKey = requiredHmacKey(
    environment.TRACKING_CODE_HMAC_KEY_V1,
    "TRACKING_CODE_HMAC_KEY_V1",
  );
  const trackingUrlKey = requiredHmacKey(
    environment.TRACKING_URL_HMAC_KEY_V1,
    "TRACKING_URL_HMAC_KEY_V1",
  );
  const rateLimitIdentifierKey = requiredHmacKey(
    environment.RATE_LIMIT_IDENTIFIER_HMAC_KEY_V1,
    "RATE_LIMIT_IDENTIFIER_HMAC_KEY_V1",
  );
  const comparedSecrets: Array<[string, Buffer]> = [
    ["TRACKING_CODE_HMAC_KEY_V1", trackingCodeKey],
    ["TRACKING_URL_HMAC_KEY_V1", trackingUrlKey],
    ["RATE_LIMIT_IDENTIFIER_HMAC_KEY_V1", rateLimitIdentifierKey],
  ];

  if (environment.BETTER_AUTH_SECRET) {
    comparedSecrets.push([
      "BETTER_AUTH_SECRET",
      Buffer.from(environment.BETTER_AUTH_SECRET, "utf8"),
    ]);
  }

  assertIndependentSecrets(comparedSecrets);

  return {
    trackingCodeKey,
    trackingUrlKey,
    rateLimitIdentifierKey,
  };
}

export function createHumanReadableTrackingCode(entropy = randomBytes(20)) {
  if (entropy.length !== 20) {
    throw new Error("Tracking-code entropy must contain exactly 20 bytes.");
  }

  const encoded = Array.from(
    entropy,
    (byte) => CROCKFORD_BASE32[byte & 31],
  ).join("");
  const groups = encoded.match(/.{4}/gu);

  if (!groups || groups.length !== 5) {
    throw new Error("Tracking-code encoding failed.");
  }

  return `BM-${groups.join("-")}`;
}

export function createTrackingUrlToken(entropy = randomBytes(32)) {
  if (entropy.length !== 32) {
    throw new Error("Tracking URL entropy must contain exactly 32 bytes.");
  }

  return `bmu_${entropy.toString("base64url")}`;
}

export function digestCredential(value: string, key: Buffer) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

export function createTrackingCredentialPair(
  trackingCodeKey: Buffer,
  trackingUrlKey: Buffer,
): TrackingCredentialPair {
  const trackingCode = createHumanReadableTrackingCode();
  const trackingUrlToken = createTrackingUrlToken();

  return {
    trackingCode,
    trackingUrlToken,
    trackingPath: `/lacak#t=${trackingUrlToken}`,
    trackingCodeDigest: digestCredential(trackingCode, trackingCodeKey),
    trackingCodeKeyVersion: HMAC_KEY_VERSION,
    trackingUrlDigest: digestCredential(trackingUrlToken, trackingUrlKey),
    trackingUrlKeyVersion: HMAC_KEY_VERSION,
  };
}

export function createTrackingCredentialPairForIdempotency(
  idempotencyKey: string,
  trackingCodeKey: Buffer,
  trackingUrlKey: Buffer,
): TrackingCredentialPair {
  const codeEntropy = createHmac("sha256", trackingCodeKey)
    .update("bawean-menfess:tracking-code\0", "utf8")
    .update(idempotencyKey, "utf8")
    .digest()
    .subarray(0, 20);
  const urlEntropy = createHmac("sha256", trackingUrlKey)
    .update("bawean-menfess:tracking-url\0", "utf8")
    .update(idempotencyKey, "utf8")
    .digest();
  const trackingCode = createHumanReadableTrackingCode(codeEntropy);
  const trackingUrlToken = createTrackingUrlToken(urlEntropy);

  return {
    trackingCode,
    trackingUrlToken,
    trackingPath: `/lacak#t=${trackingUrlToken}`,
    trackingCodeDigest: digestCredential(trackingCode, trackingCodeKey),
    trackingCodeKeyVersion: HMAC_KEY_VERSION,
    trackingUrlDigest: digestCredential(trackingUrlToken, trackingUrlKey),
    trackingUrlKeyVersion: HMAC_KEY_VERSION,
  };
}

export type ParsedTrackingCredential =
  | { kind: "code"; normalized: string }
  | { kind: "url"; normalized: string };

export function parseTrackingCredential(
  input: string,
): ParsedTrackingCredential | null {
  const trimmed = input.trim();
  const normalizedCode = trimmed.toUpperCase();

  if (TRACKING_CODE_PATTERN.test(normalizedCode)) {
    return { kind: "code", normalized: normalizedCode };
  }

  if (TRACKING_URL_TOKEN_PATTERN.test(trimmed)) {
    return { kind: "url", normalized: trimmed };
  }

  return null;
}

export function normalizeClientAddress(address: string) {
  const trimmed = address.trim();
  const version = isIP(trimmed);

  if (version === 4) {
    return trimmed;
  }

  if (version === 6) {
    const hostname = new URL(`http://[${trimmed}]/`).hostname;
    return hostname.slice(1, -1).toLowerCase();
  }

  throw new Error("A valid client address is required.");
}

export function trustedClientAddress(
  request: Request,
  environment: D2Environment = process.env,
) {
  if (environment.VERCEL === "1") {
    const address = request.headers.get("x-vercel-forwarded-for");

    if (!address || address.includes(",")) {
      throw new Error("Trusted Vercel client address is unavailable.");
    }

    return normalizeClientAddress(address);
  }

  if (environment.NODE_ENV === "production") {
    throw new Error("A trusted production proxy is not configured.");
  }

  const developmentAddress =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for")?.split(",", 1)[0] ??
    "127.0.0.1";

  return normalizeClientAddress(developmentAddress);
}

export function createRateLimitIdentifier(
  request: Request,
  scope: RateLimitScope,
  environment: D2Environment = process.env,
) {
  const { rateLimitIdentifierKey } = loadD2Secrets(environment);
  const address = trustedClientAddress(request, environment);

  return {
    digest: createHmac("sha256", rateLimitIdentifierKey)
      .update(`${scope}\0${address}`, "utf8")
      .digest(),
    keyVersion: HMAC_KEY_VERSION,
  };
}

export function createRateLimitKeyDigest(
  value: string,
  scope: RateLimitScope,
  environment: D2Environment = process.env,
) {
  const { rateLimitIdentifierKey } = loadD2Secrets(environment);

  return {
    digest: createHmac("sha256", rateLimitIdentifierKey)
      .update(`${scope}\0${value}`, "utf8")
      .digest(),
    keyVersion: HMAC_KEY_VERSION,
  };
}
