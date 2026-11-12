import "server-only";

import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { PHOTO_BUCKET, validPhotoPath, type PreparedPhoto } from "@/lib/menfess-photo";

type PhotoRow = {
  id: string;
  objectPath: string;
  state: string;
  updatedAt: Date;
};

function storage() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Private photo storage is not configured.");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co")) {
    throw new Error("Invalid private photo storage origin.");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).storage.from(PHOTO_BUCKET);
}

export async function stagePhoto(photo: PreparedPhoto) {
  if (!validPhotoPath(photo.objectPath)) throw new Error("Invalid photo object path.");
  const [row] = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO app_private.menfess_photo
      (object_path, content_type, byte_size, content_sha256, state)
    VALUES
      (${photo.objectPath}, ${photo.contentType}, ${photo.bytes.length},
       ${photo.contentSha256}, 'STAGED')
    RETURNING id
  `;
  if (!row) throw new Error("Photo staging returned no record.");

  try {
    const { error } = await storage().upload(photo.objectPath, Uint8Array.from(photo.bytes), {
      contentType: photo.contentType,
      cacheControl: "0",
      upsert: false,
    });
    if (error) throw error;
  } catch (error) {
    // The upload may have succeeded despite a lost response. Leave a durable
    // staged row if removal fails so the reconciler can retry.
    await discardStagedPhoto(row.id).catch(() => undefined);
    throw error;
  }
  return row.id;
}

async function claimAndRemove(row: PhotoRow) {
  if (!validPhotoPath(row.objectPath)) throw new Error("Invalid photo object path.");
  const claim = await prisma.menfessPhoto.updateMany({
    where: {
      id: row.id,
      state: row.state,
      ...(row.state === "CLEANING"
        ? { updatedAt: { lt: new Date(Date.now() - 2 * 60 * 60 * 1_000) } }
        : {}),
    },
    data: { state: "CLEANING", updatedAt: new Date() },
  });
  if (claim.count !== 1) return false;

  const { error } = await storage().remove([row.objectPath]);
  if (error) {
    await prisma.menfessPhoto.updateMany({
      where: { id: row.id, state: "CLEANING" },
      data: { state: row.state, updatedAt: new Date() },
    });
    throw error;
  }
  await prisma.menfessPhoto.deleteMany({ where: { id: row.id, state: "CLEANING" } });
  return true;
}

export async function discardStagedPhoto(id: string) {
  const row = await prisma.menfessPhoto.findFirst({
    where: { id, state: "STAGED", menfessId: null },
    select: { id: true, objectPath: true, state: true, updatedAt: true },
  });
  if (row) await claimAndRemove(row);
}

export async function cleanupPhotoForMenfess(id: string) {
  const row = await prisma.menfessPhoto.findFirst({
    where: { menfessId: id, state: "DELETE_PENDING" },
    select: { id: true, objectPath: true, state: true, updatedAt: true },
  });
  if (row) await claimAndRemove(row);
}

export async function reconcilePhotos(limit = 25) {
  const stale = new Date(Date.now() - 2 * 60 * 60 * 1_000);
  const rows = await prisma.menfessPhoto.findMany({
    where: {
      OR: [
        { state: "DELETE_PENDING" },
        { state: { in: ["STAGED", "CLEANING"] }, updatedAt: { lt: stale } },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: Math.min(Math.max(limit, 1), 25),
    select: { id: true, objectPath: true, state: true, updatedAt: true },
  });
  let removed = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      if (await claimAndRemove(row)) removed += 1;
    } catch {
      failed += 1;
    }
  }
  return { removed, failed };
}

export async function downloadPhoto(id: string) {
  const row = await prisma.menfessPhoto.findFirst({
    where: {
      menfessId: id,
      state: "ATTACHED",
      menfess: { status: { in: ["PENDING", "APPROVED"] } },
    },
    select: { objectPath: true, contentType: true },
  });
  if (!row || !validPhotoPath(row.objectPath)) return null;
  const { data, error } = await storage().download(row.objectPath);
  if (error || !data) throw new Error("Private photo download failed.");
  return { bytes: await data.arrayBuffer(), contentType: row.contentType };
}
