import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { MAX_PHOTO_BYTES } from "@/lib/menfess-photo-constants";

export { MAX_PHOTO_BYTES } from "@/lib/menfess-photo-constants";
export const PHOTO_BUCKET = "menfess-photos";
const MAX_PIXELS = 16_000_000;

const formats = {
  "image/jpeg": { format: "jpeg", extension: "jpg" },
  "image/png": { format: "png", extension: "png" },
  "image/webp": { format: "webp", extension: "webp" },
} as const;

export class PhotoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoValidationError";
  }
}

export type PreparedPhoto = {
  bytes: Buffer;
  contentType: keyof typeof formats;
  contentSha256: Uint8Array<ArrayBuffer>;
  objectPath: string;
};

function matchesSignature(bytes: Buffer, contentType: keyof typeof formats) {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!(file.type in formats)) {
    throw new PhotoValidationError("Gunakan foto JPEG, PNG, atau WebP.");
  }
  if (file.size < 1 || file.size > MAX_PHOTO_BYTES) {
    throw new PhotoValidationError("Ukuran foto maksimal 1 MiB.");
  }

  const contentType = file.type as keyof typeof formats;
  const original = Buffer.from(await file.arrayBuffer());
  if (original.length !== file.size || !matchesSignature(original, contentType)) {
    throw new PhotoValidationError("Isi foto tidak sesuai dengan format berkas.");
  }

  try {
    const decoder = sharp(original, { limitInputPixels: MAX_PIXELS, failOn: "error" });
    const metadata = await decoder.metadata();
    if (metadata.format !== formats[contentType].format || metadata.pages !== undefined && metadata.pages !== 1) {
      throw new PhotoValidationError("Foto harus berupa satu gambar JPEG, PNG, atau WebP yang valid.");
    }

    // Re-encoding applies EXIF orientation and strips EXIF, XMP, ICC, and other
    // metadata. No client-provided bytes or filename reach Storage unchanged.
    const pipeline = decoder.rotate();
    const bytes = await (contentType === "image/jpeg"
      ? pipeline.jpeg({ quality: 85 }).toBuffer()
      : contentType === "image/png"
        ? pipeline.png().toBuffer()
        : pipeline.webp({ quality: 85 }).toBuffer());
    if (bytes.length > MAX_PHOTO_BYTES) {
      throw new PhotoValidationError("Foto setelah diproses melebihi 1 MiB. Pilih foto lain.");
    }
    return {
      bytes,
      contentType,
      contentSha256: Uint8Array.from(createHash("sha256").update(bytes).digest()),
      objectPath: `photos/${randomUUID()}.${formats[contentType].extension}`,
    };
  } catch (error) {
    if (error instanceof PhotoValidationError) throw error;
    throw new PhotoValidationError("Foto tidak dapat dibaca atau formatnya tidak didukung.");
  }
}

export function validPhotoPath(path: string) {
  return /^photos\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/u.test(path);
}
