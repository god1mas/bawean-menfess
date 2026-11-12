"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  type FormEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { copyText } from "@/lib/clipboard";
import { ClientRequestError, requestJson } from "@/lib/client-json";
import { MAX_PHOTO_BYTES } from "@/lib/menfess-photo-constants";

type Category = { slug: string; label: string };
type FieldErrors = Partial<Record<"category" | "message" | "consent" | "photo", string>>;
type SubmitSuccess = { trackingCode: string; trackingPath: string };

function createSubmissionIdempotencyKey() {
  const entropy = new Uint8Array(32);
  crypto.getRandomValues(entropy);
  const encoded = btoa(String.fromCharCode(...entropy))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");

  return `bmi_${encoded}`;
}

export function SubmitForm() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [categoryError, setCategoryError] = useState<string>();
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [photo, setPhoto] = useState<File>();
  const [photoPreview, setPhotoPreview] = useState<string>();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [requestError, setRequestError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState<SubmitSuccess>();
  const successHeading = useRef<HTMLHeadingElement>(null);
  const idempotencyKey = useRef<string | undefined>(undefined);
  const photoInput = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | undefined>(undefined);

  useEffect(() => () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);

  function selectPhoto(file?: File) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = undefined;
    setPhoto(undefined);
    setPhotoPreview(undefined);
    setErrors((current) => ({ ...current, photo: undefined }));
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setErrors((current) => ({ ...current, photo: "Gunakan foto JPEG, PNG, atau WebP." }));
      return;
    }
    if (file.size < 1 || file.size > MAX_PHOTO_BYTES) {
      setErrors((current) => ({ ...current, photo: "Ukuran foto maksimal 1 MiB." }));
      return;
    }
    const url = URL.createObjectURL(file);
    previewUrl.current = url;
    setPhoto(file);
    setPhotoPreview(url);
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories() {
      try {
        const body = await requestJson<{
          categories?: Category[];
        }>(
          "/api/public/categories",
          { cache: "no-store", signal: controller.signal },
          {
            fallbackMessage: "Kategori belum dapat dimuat.",
            timeoutMessage: "Pemuatan kategori terlalu lama. Coba lagi.",
          },
        );

        if (!body.categories) {
          throw new ClientRequestError("Kategori belum dapat dimuat.");
        }

        setCategories(body.categories);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setCategoryError("Kategori belum tersedia. Coba muat ulang halaman ini.");
        setCategories([]);
      }
    }

    void loadCategories();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (success) {
      successHeading.current?.focus();
    }
  }, [success]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: FieldErrors = {};

    if (!category) nextErrors.category = "Pilih kategori terlebih dahulu.";
    if (!message.trim()) nextErrors.message = "Pesan menfess wajib diisi.";
    if (message.trim().length > 1_000) {
      nextErrors.message = "Pesan menfess maksimal 1.000 karakter.";
    }
    if (!consent) {
      nextErrors.consent = "Persetujuan moderasi wajib diberikan.";
    }
    if (errors.photo) nextErrors.photo = errors.photo;

    setErrors(nextErrors);
    setRequestError(undefined);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setPending(true);

    try {
      idempotencyKey.current ??= createSubmissionIdempotencyKey();
      const form = photo ? new FormData() : undefined;
      if (form && photo) {
        form.set("category", category);
        form.set("message", message);
        form.set("consent", String(consent));
        form.set("idempotencyKey", idempotencyKey.current);
        form.set("photo", photo);
      }
      const body = await requestJson<{
        trackingCode?: string;
        trackingPath?: string;
      }>(
        "/api/public/menfess",
        {
          method: "POST",
          ...(form ? {} : { headers: { "Content-Type": "application/json" } }),
          body: form ?? JSON.stringify({
            category,
            message,
            consent,
            idempotencyKey: idempotencyKey.current,
          }),
        },
        {
          fallbackMessage: "Menfess belum dapat dikirim. Coba lagi nanti.",
          timeoutMessage:
            "Pengiriman terlalu lama. Coba lagi; permintaan yang sama tidak akan menggandakan menfess.",
        },
      );

      if (!body.trackingCode || !body.trackingPath) {
        throw new ClientRequestError(
          "Menfess belum dapat dikirim. Coba lagi nanti.",
        );
      }

      setSuccess({
        trackingCode: body.trackingCode,
        trackingPath: body.trackingPath,
      });
    } catch (error) {
      if (error instanceof ClientRequestError && error.fields) {
        setErrors({
          category: error.fields.category,
          message: error.fields.message,
          consent: error.fields.consent,
          photo: error.fields.photo,
        });
      }
      setRequestError(
        error instanceof Error
          ? error.message
          : "Menfess belum dapat dikirim. Coba lagi nanti.",
      );
    } finally {
      setPending(false);
    }
  }

  if (success) {
    return (
      <SubmissionSuccess
        result={success}
        headingRef={successHeading}
        onReset={() => {
          setCategory("");
          setMessage("");
          setConsent(false);
          selectPhoto();
          if (photoInput.current) photoInput.current.value = "";
          idempotencyKey.current = undefined;
          setSuccess(undefined);
        }}
      />
    );
  }

  const categoriesUnavailable = categories?.length === 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-7" noValidate>
      <fieldset disabled={pending || categoriesUnavailable}>
        <legend className="text-sm font-bold text-bm-brand">Pilih kategori</legend>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {categories === null ? (
            <span className="text-sm text-bm-muted">Memuat kategori...</span>
          ) : null}
          {categories?.map((item) => (
            <label key={item.slug} className="cursor-pointer">
              <input
                type="radio"
                name="category"
                value={item.slug}
                checked={category === item.slug}
                onChange={() => {
                  setCategory(item.slug);
                  setErrors((current) => ({ ...current, category: undefined }));
                }}
                className="peer sr-only"
              />
              <span className="block rounded-full bg-bm-page px-4 py-2.5 text-xs font-bold text-bm-brand transition-colors peer-checked:bg-bm-brand peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-bm-brand">
                {item.label}
              </span>
            </label>
          ))}
        </div>
        {categoryError ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {categoryError}
          </p>
        ) : null}
        {errors.category ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {errors.category}
          </p>
        ) : null}
      </fieldset>

      <div>
        <label htmlFor="message" className="text-sm font-bold text-bm-brand">
          Pesan Menfess
        </label>
        <textarea
          id="message"
          name="message"
          rows={9}
          maxLength={1_000}
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            setErrors((current) => ({ ...current, message: undefined }));
          }}
          aria-describedby="message-help message-count message-error"
          aria-invalid={Boolean(errors.message)}
          placeholder="Tulis ceritamu di sini..."
          className="mt-2 min-h-52 w-full resize-y rounded-xl border border-bm-border bg-[var(--bm-input-surface)] px-4 py-4 text-sm leading-6 text-bm-text outline-none placeholder:text-[var(--bm-input-placeholder)] focus:border-bm-brand focus:ring-2 focus:ring-bm-brand/15"
        />
        <p id="message-help" className="mt-2 text-xs leading-5 text-bm-muted">
          Jangan cantumkan nomor telepon, alamat, atau informasi pribadi orang lain.
        </p>
        <div className="mt-1 flex items-start justify-between gap-4">
          <p id="message-error" className="text-xs text-red-700" role="alert">
            {errors.message}
          </p>
          <p id="message-count" className="shrink-0 text-xs text-bm-muted">
            {message.length} / 1000 karakter
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="menfess-photo" className="text-sm font-bold text-bm-brand">
          Foto (opsional)
        </label>
        <input
          ref={photoInput}
          id="menfess-photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={pending}
          aria-describedby="photo-help photo-error"
          aria-invalid={Boolean(errors.photo)}
          onChange={(event) => {
            if (event.currentTarget.files && event.currentTarget.files.length > 1) {
              selectPhoto();
              setErrors((current) => ({ ...current, photo: "Pilih satu foto saja." }));
            } else {
              selectPhoto(event.currentTarget.files?.[0]);
            }
          }}
          className="mt-2 block w-full rounded-xl border border-bm-border bg-white p-3 text-sm text-bm-text file:mr-3 file:rounded-lg file:border-0 file:bg-bm-mint file:px-3 file:py-2 file:font-bold file:text-bm-brand focus-visible:outline-2 focus-visible:outline-bm-brand"
        />
        <p id="photo-help" className="mt-2 text-xs leading-5 text-bm-muted">
          Maksimal satu foto JPEG, PNG, atau WebP, ukuran 1 MiB. Foto disimpan sementara untuk moderasi dan publikasi manual.
        </p>
        {errors.photo ? <p id="photo-error" className="mt-2 text-xs text-red-700" role="alert">{errors.photo}</p> : null}
        {photo && photoPreview ? (
          <div className="mt-3 rounded-xl border border-bm-border bg-bm-page p-3">
            {/* A local blob URL is intentionally not sent through Next image optimization. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreview} alt="Pratinjau foto terpilih" className="max-h-64 max-w-full rounded-lg object-contain" />
            <button type="button" disabled={pending} onClick={() => {
              selectPhoto();
              if (photoInput.current) photoInput.current.value = "";
            }} className="mt-3 rounded-lg border border-bm-border bg-white px-3 py-2 text-xs font-bold text-bm-brand focus-visible:outline-2 focus-visible:outline-bm-brand">
              Hapus foto
            </button>
          </div>
        ) : null}
      </div>

      <div>
        <label className="flex items-start gap-3 text-xs leading-5 text-bm-muted">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => {
              setConsent(event.target.checked);
              setErrors((current) => ({ ...current, consent: undefined }));
            }}
            aria-invalid={Boolean(errors.consent)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--bm-bg-brand)]"
          />
          <span>
            Saya memahami bahwa pesan, kategori, dan foto bila dipilih akan disimpan untuk moderasi,
            pesan dapat ditolak, dan persetujuan tidak menjamin publikasi. Saya
            telah membaca{" "}
            <Link
              className="font-bold text-bm-brand underline"
              href={"/aturan" as Route}
            >
              aturan komunitas
            </Link>{" "}
            dan{" "}
            <Link
              className="font-bold text-bm-brand underline"
              href={"/privasi" as Route}
            >
              informasi privasi
            </Link>
            .
          </span>
        </label>
        {errors.consent ? (
          <p className="mt-2 text-xs text-red-700" role="alert">
            {errors.consent}
          </p>
        ) : null}
      </div>

      {requestError ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {requestError}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending || categories === null || categoriesUnavailable}
        className="w-full rounded-[14px] bg-bm-brand px-6 py-4 text-sm font-bold text-white transition-colors hover:bg-bm-deep focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-bm-brand disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
      >
        {pending ? "Mengirim..." : "Kirim Menfess →"}
      </button>
      <p className="text-xs leading-5 text-bm-muted">
        Setelah mengirim, kamu akan mendapatkan dua kredensial pelacakan privat.
      </p>

      <aside className="rounded-[20px] bg-bm-mint p-5 text-bm-brand">
        <p className="text-xs font-bold">SEBELUM MENGIRIM</p>
        <ul className="mt-4 space-y-1 text-xs leading-5">
          <li>• Jangan cantumkan informasi pribadi orang lain.</li>
          <li>• Hormati orang lain dalam ceritamu.</li>
          <li>• Simpan kode dan tautan setelah pengiriman.</li>
        </ul>
      </aside>
    </form>
  );
}

type SubmissionSuccessProps = {
  result: SubmitSuccess;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onReset: () => void;
};

function SubmissionSuccess({
  result,
  headingRef,
  onReset,
}: SubmissionSuccessProps) {
  const [copied, setCopied] = useState<"code" | "link">();
  const [copyError, setCopyError] = useState<"code" | "link">();
  const trackingUrl =
    typeof window === "undefined"
      ? result.trackingPath
      : new URL(result.trackingPath, window.location.origin).toString();

  async function copy(value: string, kind: "code" | "link") {
    try {
      await copyText(value);
      setCopyError(undefined);
      setCopied(kind);
    } catch {
      setCopied(undefined);
      setCopyError(kind);
    }
  }

  return (
    <section aria-live="polite" className="space-y-6">
      <div className="inline-flex size-12 items-center justify-center rounded-full bg-bm-mint text-2xl text-bm-brand">
        ✓
      </div>
      <div>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-extrabold text-bm-brand outline-none"
        >
          Menfess berhasil dikirim.
        </h2>
        <p className="mt-2 text-sm leading-6 text-bm-muted">
          Simpan kedua kredensial ini sekarang. Kami tidak dapat memulihkannya
          karena hanya digest aman yang disimpan.
        </p>
      </div>

      <CredentialCard
        label="Kode pelacakan"
        value={result.trackingCode}
        copied={copied === "code"}
        copyFailed={copyError === "code"}
        onCopy={() => copy(result.trackingCode, "code")}
      />
      <CredentialCard
        label="Tautan pelacakan privat"
        value={trackingUrl}
        copied={copied === "link"}
        copyFailed={copyError === "link"}
        onCopy={() => copy(trackingUrl, "link")}
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href={result.trackingPath as Route}
          className="rounded-[14px] bg-bm-brand px-5 py-3 text-center text-sm font-bold text-white"
        >
          Lacak menfess →
        </Link>
        <button
          type="button"
          onClick={onReset}
          className="rounded-[14px] border border-bm-border px-5 py-3 text-sm font-bold text-bm-brand"
        >
          Kirim menfess lain
        </button>
      </div>
    </section>
  );
}

type CredentialCardProps = {
  label: string;
  value: string;
  copied: boolean;
  copyFailed: boolean;
  onCopy: () => Promise<void>;
};

export function CredentialCard({
  label,
  value,
  copied,
  copyFailed,
  onCopy,
}: CredentialCardProps) {
  return (
    <div className="rounded-2xl border border-bm-border bg-bm-page p-4">
      <p className="text-xs font-bold text-bm-brand">{label}</p>
      <input
        aria-label={`${label}, pilih untuk menyalin manual`}
        className="mt-2 w-full rounded-lg border border-bm-border bg-white px-3 py-2 font-mono text-sm text-bm-text"
        onClick={(event) => event.currentTarget.select()}
        onFocus={(event) => event.currentTarget.select()}
        readOnly
        value={value}
      />
      <button
        type="button"
        onClick={() => void onCopy()}
        className="mt-3 rounded-xl bg-white px-4 py-2 text-xs font-bold text-bm-brand"
      >
        {copied ? "Tersalin ✓" : "Salin"}
      </button>
      {copyFailed ? (
        <p className="mt-3 text-xs leading-5 text-red-700" role="alert">
          Salin otomatis gagal. Pilih teks di atas lalu salin secara manual.
        </p>
      ) : null}
    </div>
  );
}
