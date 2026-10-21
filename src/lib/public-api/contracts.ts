import { z } from "zod";

export const submissionPayloadSchema = z
  .object({
    category: z
      .string()
      .trim()
      .min(1, "Pilih kategori terlebih dahulu.")
      .max(32, "Kategori tidak valid.")
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, "Kategori tidak valid."),
    message: z
      .string()
      .trim()
      .min(1, "Pesan menfess wajib diisi.")
      .max(1_000, "Pesan menfess maksimal 1.000 karakter."),
    consent: z.literal(true, {
      error: "Persetujuan moderasi wajib diberikan.",
    }),
  })
  .strict();

export const trackingPayloadSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(1, "Kode pelacakan wajib diisi.")
      .max(100, "Kode pelacakan tidak valid."),
  })
  .strict();

export type SubmissionPayload = z.infer<typeof submissionPayloadSchema>;
export type TrackingPayload = z.infer<typeof trackingPayloadSchema>;

export type PublicMenfessStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "PUBLISHED";

export type PublicCategory = {
  slug: string;
  label: string;
};

export type RateLimitScope = "submission" | "tracking";

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export type TrackingCredentialPair = {
  trackingCode: string;
  trackingUrlToken: string;
  trackingPath: string;
  trackingCodeDigest: Buffer;
  trackingCodeKeyVersion: number;
  trackingUrlDigest: Buffer;
  trackingUrlKeyVersion: number;
};
