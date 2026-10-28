"use client";

import {
  type FormEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ClientRequestError, requestJson } from "@/lib/client-json";
import type { PublicMenfessStatus } from "@/lib/public-api/contracts";

type LookupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; status: PublicMenfessStatus; displayCode: string }
  | { kind: "error"; message: string };

const statusCopy: Record<
  PublicMenfessStatus,
  { title: string; description: string }
> = {
  PENDING: {
    title: "Dalam moderasi",
    description: "Menfess sudah diterima dan sedang ditinjau oleh tim.",
  },
  APPROVED: {
    title: "Disetujui",
    description: "Menfess sudah disetujui dan menunggu publikasi manual.",
  },
  PUBLISHED: {
    title: "Dipublikasikan",
    description: "Menfess telah ditandai sebagai dipublikasikan.",
  },
  REJECTED: {
    title: "Belum dapat dipublikasikan",
    description: "Menfess telah selesai ditinjau dan tidak dilanjutkan ke publikasi.",
  },
};

export function TrackingForm() {
  const [token, setToken] = useState("");
  const [state, setState] = useState<LookupState>({ kind: "idle" });
  const resultHeading = useRef<HTMLHeadingElement>(null);

  const lookup = useCallback(async (credential: string) => {
    const normalized = credential.trim();

    if (!normalized) {
      setState({ kind: "error", message: "Kode pelacakan wajib diisi." });
      return;
    }

    setState({ kind: "loading" });

    try {
      const body = await requestJson<{
        status?: PublicMenfessStatus;
      }>(
        "/api/public/track",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: normalized }),
        },
        {
          fallbackMessage: "Status belum dapat diperiksa. Coba lagi nanti.",
          timeoutMessage: "Pemeriksaan status terlalu lama. Coba lagi.",
        },
      );

      if (!body.status) {
        throw new ClientRequestError(
          "Status belum dapat diperiksa. Coba lagi nanti.",
        );
      }

      setState({
        kind: "success",
        status: body.status,
        displayCode: normalized.toUpperCase().startsWith("BM-")
          ? normalized.toUpperCase()
          : "Tautan pelacakan privat",
      });
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Status belum dapat diperiksa. Coba lagi nanti.",
      });
    }
  }, []);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const fragmentToken = fragment.get("t");

    if (!fragmentToken) {
      return;
    }

    const lookupTimer = window.setTimeout(() => {
      window.history.replaceState(null, "", window.location.pathname);
      void lookup(fragmentToken);
    }, 0);
    return () => window.clearTimeout(lookupTimer);
  }, [lookup]);

  useEffect(() => {
    if (state.kind === "success" || state.kind === "error") {
      resultHeading.current?.focus();
    }
  }, [state]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void lookup(token);
  }

  return (
    <div className="space-y-10 md:space-y-9">
      <form
        onSubmit={handleSubmit}
        className="rounded-[20px] bg-white p-5 sm:p-8"
        noValidate
      >
        <label htmlFor="tracking-token" className="text-sm font-bold text-bm-brand">
          Kode pelacakan
        </label>
        <div className="mt-3 flex flex-col gap-3 md:flex-row">
          <input
            id="tracking-token"
            name="token"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Contoh: BM-XXXX-XXXX-XXXX-XXXX-XXXX"
            className="h-[60px] min-w-0 flex-1 rounded-xl border border-bm-border bg-[var(--bm-input-surface)] px-4 text-sm outline-none placeholder:text-[var(--bm-input-placeholder)] focus:border-bm-brand focus:ring-2 focus:ring-bm-brand/15"
          />
          <button
            type="submit"
            disabled={state.kind === "loading"}
            className="h-[52px] rounded-[13px] bg-bm-brand px-7 text-sm font-bold text-white hover:bg-bm-deep focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-bm-brand disabled:opacity-55 md:h-[60px]"
          >
            {state.kind === "loading" ? "Mencari..." : "Lacak Sekarang →"}
          </button>
        </div>
        <p className="mt-3 text-xs text-bm-muted">
          Kode bersifat privat. Jangan bagikan kepada siapa pun.
        </p>
      </form>

      {state.kind === "idle" || state.kind === "loading" ? (
        <TrackingPlaceholder loading={state.kind === "loading"} />
      ) : null}
      {state.kind === "error" ? (
        <section className="rounded-[20px] border border-red-200 bg-white p-6 sm:p-8">
          <h2
            ref={resultHeading}
            tabIndex={-1}
            className="text-xl font-extrabold text-bm-brand outline-none"
          >
            Status belum ditemukan
          </h2>
          <p className="mt-3 text-sm leading-6 text-bm-muted" role="alert">
            {state.message}
          </p>
        </section>
      ) : null}
      {state.kind === "success" ? (
        <TrackingResult
          headingRef={resultHeading}
          status={state.status}
          displayCode={state.displayCode}
        />
      ) : null}
    </div>
  );
}

function TrackingPlaceholder({ loading }: { loading: boolean }) {
  return (
    <section className="rounded-[20px] bg-white p-6 sm:p-8">
      <p className="text-xs font-bold text-bm-gold">
        {loading ? "MEMERIKSA STATUS" : "PELACAKAN PRIVAT"}
      </p>
      <h2 className="mt-3 text-xl font-extrabold text-bm-brand">
        {loading ? "Mohon tunggu sebentar..." : "Status menfess akan tampil di sini."}
      </h2>
      <p className="mt-2 text-sm leading-6 text-bm-muted">
        Kami hanya menampilkan status. Isi pesan dan catatan moderasi tetap privat.
      </p>
    </section>
  );
}

type TrackingResultProps = {
  status: PublicMenfessStatus;
  displayCode: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
};

function TrackingResult({
  status,
  displayCode,
  headingRef,
}: TrackingResultProps) {
  const copy = statusCopy[status];

  if (status === "REJECTED") {
    return (
      <section className="rounded-[20px] bg-white p-6 sm:p-8">
        <p className="text-xs font-bold text-bm-gold">STATUS MENFESS</p>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mt-3 text-2xl font-extrabold text-bm-brand outline-none"
        >
          {copy.title}
        </h2>
        <p className="mt-2 text-xs text-bm-muted">{displayCode}</p>
        <div className="mt-8 rounded-2xl bg-red-50 p-5">
          <p className="text-sm font-bold text-red-800">Peninjauan selesai</p>
          <p className="mt-2 text-sm leading-6 text-red-700">{copy.description}</p>
        </div>
      </section>
    );
  }

  const activeStep = status === "PENDING" ? 2 : status === "APPROVED" ? 3 : 4;
  const steps = [
    ["Diterima", "Pesan sudah masuk ke sistem."],
    ["Dalam moderasi", "Tim memeriksa kesesuaian pesan."],
    ["Disetujui", "Kiriman siap menunggu publikasi."],
    ["Dipublikasikan", "Kiriman telah ditandai tayang."],
  ] as const;

  return (
    <section className="rounded-[20px] bg-white p-6 sm:p-8">
      <p className="text-xs font-bold text-bm-gold">STATUS MENFESS</p>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="mt-3 text-2xl font-extrabold text-bm-brand outline-none"
      >
        {copy.title}
      </h2>
      <p className="mt-2 text-xs text-bm-muted">{displayCode}</p>
      <p className="mt-4 text-sm leading-6 text-bm-muted">{copy.description}</p>

      <ol className="mt-9 grid gap-7 md:grid-cols-4 md:gap-5">
        {steps.map(([title, description], index) => {
          const step = index + 1;
          const active = step <= activeStep;
          return (
            <li key={title} className="flex gap-4 md:flex-col">
              <span
                className={`flex size-11 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  active ? "bg-bm-brand text-white" : "bg-bm-mint text-bm-brand"
                }`}
              >
                {String(step).padStart(2, "0")}
              </span>
              <div>
                <p className="text-base font-bold text-bm-brand">{title}</p>
                <p className="mt-2 text-xs leading-5 text-bm-muted">{description}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
