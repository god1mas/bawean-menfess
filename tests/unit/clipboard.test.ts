import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CredentialCard } from "../../src/components/public/submit-form";
import { copyText } from "../../src/lib/clipboard";

describe("tracking credential clipboard fallback", () => {
  it("uses the clipboard API when permission is available", async () => {
    const writeText = vi.fn(async () => undefined);
    await copyText("BM-TEST", { writeText });
    expect(writeText).toHaveBeenCalledWith("BM-TEST");
  });

  it("keeps a selectable credential and explains manual copy after failure", async () => {
    await expect(copyText("BM-TEST", undefined)).rejects.toThrow();
    const markup = renderToStaticMarkup(
      createElement(CredentialCard, {
        label: "Kode pelacakan",
        value: "BM-0123-4567-89AB-CDEF-GHJK",
        copied: false,
        copyFailed: true,
        onCopy: async () => undefined,
      }),
    );

    expect(markup).toContain("readOnly");
    expect(markup).toContain("BM-0123-4567-89AB-CDEF-GHJK");
    expect(markup).toContain("Salin otomatis gagal");
    expect(markup).toContain('role="alert"');
  });
});
