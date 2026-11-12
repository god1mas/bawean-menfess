import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ getAdminAuthorization: vi.fn() }));
vi.mock("@/lib/menfess-photo-service", () => ({ downloadPhoto: vi.fn() }));

import { GET } from "../../src/app/api/admin/moderation/[id]/photo/route";
import { getAdminAuthorization } from "../../src/lib/admin-auth";
import { downloadPhoto } from "../../src/lib/menfess-photo-service";

const id = randomUUID();
const request = (suffix = "") => new Request(`https://menfess.example/api/admin/moderation/${id}/photo${suffix}`);
const context = (value: string = id) => ({ params: Promise.resolve({ id: value }) });

describe("private administrator photo route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getAdminAuthorization).mockResolvedValue({
      kind: "authorized", user: { id: randomUUID(), name: "Admin" },
    });
    vi.mocked(downloadPhoto).mockResolvedValue({
      bytes: Uint8Array.from([137, 80, 78, 71]).buffer,
      contentType: "image/png",
    });
  });

  it("denies anonymous and non-admin access before reading Storage", async () => {
    vi.mocked(getAdminAuthorization).mockResolvedValueOnce({ kind: "unauthenticated" });
    expect((await GET(request(), context())).status).toBe(401);
    vi.mocked(getAdminAuthorization).mockResolvedValueOnce({ kind: "forbidden" });
    expect((await GET(request(), context())).status).toBe(403);
    expect(downloadPhoto).not.toHaveBeenCalled();
  });

  it("returns private no-store images and a forced download option", async () => {
    const inline = await GET(request(), context());
    expect(inline.status).toBe(200);
    expect(inline.headers.get("content-type")).toBe("image/png");
    expect(inline.headers.get("cache-control")).toContain("no-store");
    expect(inline.headers.get("x-content-type-options")).toBe("nosniff");
    expect(inline.headers.get("content-disposition")).toContain("inline");
    const attachment = await GET(request("?download=1"), context());
    expect(attachment.headers.get("content-disposition")).toContain("attachment");
  });

  it("rejects invalid IDs and unavailable photos", async () => {
    expect((await GET(request(), context("not-a-uuid"))).status).toBe(404);
    vi.mocked(downloadPhoto).mockResolvedValueOnce(null);
    expect((await GET(request(), context())).status).toBe(404);
  });
});
