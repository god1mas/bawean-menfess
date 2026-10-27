"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";

type Status = "PENDING" | "APPROVED" | "REJECTED" | "PUBLISHED";
type Category = { slug: string; label: string; isActive: boolean };
type QueueItem = {
  id: string;
  message: string;
  status: Status;
  version: number;
  submittedAt: string;
  category: { slug: string; label: string };
};
type Activity = {
  id: string;
  action: "APPROVE" | "REJECT" | "MARK_PUBLISHED";
  fromStatus: Status;
  toStatus: Status;
  note: string | null;
  createdAt: string;
  menfessId: string;
  actor: { name: string };
};
type DashboardData = {
  stats: {
    total: number;
    pending: number;
    approvedPublished: number;
    rejected: number;
  };
  categories: Category[];
  recentActivity: Activity[];
  queue: {
    items: QueueItem[];
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
  };
};
type Detail = QueueItem & {
  updatedAt: string;
  publishedAt: string | null;
  publicationReference: string | null;
  trackingCredentials: string;
  moderationLogs: Array<{
    id: string;
    action: Activity["action"];
    fromStatus: Status;
    toStatus: Status;
    note: string | null;
    createdAt: string;
    actor: { name: string };
  }>;
};

const statuses: Array<{ value: Status | ""; label: string }> = [
  { value: "", label: "Semua status" },
  { value: "PENDING", label: "Menunggu" },
  { value: "APPROVED", label: "Disetujui" },
  { value: "PUBLISHED", label: "Dipublikasikan" },
  { value: "REJECTED", label: "Ditolak" },
];

const statusLabels: Record<Status, string> = {
  PENDING: "Menunggu",
  APPROVED: "Disetujui",
  PUBLISHED: "Dipublikasikan",
  REJECTED: "Ditolak",
};

const actionLabels: Record<Activity["action"], string> = {
  APPROVE: "Menyetujui",
  REJECT: "Menolak",
  MARK_PUBLISHED: "Mempublikasikan",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "Permintaan belum dapat diproses.");
  }
  return body;
}

export function ModerationDashboard() {
  const [data, setData] = useState<DashboardData>();
  const [detail, setDetail] = useState<Detail>();
  const [selectedId, setSelectedId] = useState<string>();
  const [status, setStatus] = useState<Status | "">("PENDING");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [reason, setReason] = useState("");
  const [acting, setActing] = useState(false);
  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "20",
      sort,
    });
    if (status) params.set("status", status);
    if (category) params.set("category", category);
    if (appliedSearch) params.set("search", appliedSearch);
    return params.toString();
  }, [appliedSearch, category, page, sort, status]);
  const selectedDetail =
    selectedId && detail?.id === selectedId ? detail : undefined;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/moderation?${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(readResponse<DashboardData>)
      .then(setData)
      .catch((reasonValue: unknown) => {
        if (reasonValue instanceof DOMException && reasonValue.name === "AbortError") {
          return;
        }
        setError(
          reasonValue instanceof Error
            ? reasonValue.message
            : "Data moderasi belum dapat dimuat.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    fetch(`/api/admin/moderation/${selectedId}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(readResponse<{ item: Detail }>)
      .then(({ item }) => setDetail(item))
      .catch((reasonValue: unknown) => {
        if (reasonValue instanceof DOMException && reasonValue.name === "AbortError") {
          return;
        }
        setActionError(
          reasonValue instanceof Error
            ? reasonValue.message
            : "Detail belum dapat dimuat.",
        );
      });
    return () => controller.abort();
  }, [selectedId]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSearch = search.trim();
    if (nextSearch === appliedSearch && page === 1) {
      void reload().catch(() => setError("Data belum dapat dimuat."));
      return;
    }
    setLoading(true);
    setError(undefined);
    setPage(1);
    setAppliedSearch(nextSearch);
  }

  async function performAction(action: "APPROVE" | "REJECT" | "PUBLISH") {
    if (!selectedDetail) return;
    setActing(true);
    setActionError(undefined);
    try {
      const response = await fetch(`/api/admin/moderation/${selectedDetail.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          expectedVersion: selectedDetail.version,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });
      await readResponse(response);
      setReason("");
      await reload();
    } catch (reasonValue) {
      setActionError(
        reasonValue instanceof Error
          ? reasonValue.message
          : "Aksi moderasi belum dapat disimpan.",
      );
      try {
        await reload();
      } catch {
        setError("Data belum dapat dimuat ulang.");
      }
    } finally {
      setActing(false);
    }
  }

  async function reload() {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/admin/moderation?${query}`, {
        cache: "no-store",
      });
      const next = await readResponse<DashboardData>(response);
      setData(next);
      if (selectedId) {
        const detailResponse = await fetch(`/api/admin/moderation/${selectedId}`, {
          cache: "no-store",
        });
        const nextDetail = await readResponse<{ item: Detail }>(detailResponse);
        setDetail(nextDetail.item);
      }
    } finally {
      setLoading(false);
    }
  }

  function changeQueueFilter(update: () => void) {
    setLoading(true);
    setError(undefined);
    update();
  }

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-bm-gold">
            Ruang kendali
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-bm-brand md:text-4xl">
            Moderasi menfess
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-bm-muted">
            Tinjau cerita dengan cermat. Identitas pengirim dan kredensial
            pelacakan tidak ditampilkan kepada moderator.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void reload().catch(() => setError("Data belum dapat dimuat."))}
          className="rounded-xl border border-bm-border bg-white px-4 py-3 text-sm font-bold text-bm-brand hover:bg-bm-admin-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bm-brand"
        >
          Muat ulang
        </button>
      </section>

      <section
        id="dashboard-summary"
        aria-label="Ringkasan menfess"
        className="scroll-mt-24 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard label="Total kiriman" value={data?.stats.total} tone="green" />
        <StatCard label="Menunggu moderasi" value={data?.stats.pending} tone="gold" />
        <StatCard label="Disetujui / tayang" value={data?.stats.approvedPublished} tone="mint" />
        <StatCard label="Ditolak" value={data?.stats.rejected} tone="neutral" />
      </section>

      <section
        id="moderation-queue"
        className="scroll-mt-24 grid items-start gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]"
      >
        <div className="overflow-hidden rounded-[22px] border border-bm-border bg-white shadow-sm">
          <div className="border-b border-bm-border p-5 md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-extrabold text-bm-brand">Antrean moderasi</h2>
                <p className="mt-1 text-sm text-bm-muted">
                  {data ? `${data.queue.total} kiriman ditemukan` : "Memuat antrean…"}
                </p>
              </div>
            </div>
            <form
              onSubmit={submitSearch}
              className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            >
              <label className="text-xs font-bold text-bm-brand sm:col-span-2 xl:col-span-1">
                Cari isi pesan
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  maxLength={200}
                  className="mt-1.5 h-11 w-full rounded-xl border border-bm-border px-3 text-sm font-normal text-bm-text outline-none focus:border-bm-brand focus:ring-2 focus:ring-bm-brand/15"
                  placeholder="Kata atau frasa…"
                />
              </label>
              <label className="text-xs font-bold text-bm-brand">
                Status
                <select
                  value={status}
                  onChange={(event) => {
                    changeQueueFilter(() => {
                      setStatus(event.target.value as Status | "");
                      setPage(1);
                    });
                  }}
                  className="mt-1.5 h-11 w-full rounded-xl border border-bm-border bg-white px-3 text-sm font-normal text-bm-text"
                >
                  {statuses.map((item) => (
                    <option key={item.value || "all"} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-bm-brand">
                Kategori
                <select
                  value={category}
                  onChange={(event) => {
                    changeQueueFilter(() => {
                      setCategory(event.target.value);
                      setPage(1);
                    });
                  }}
                  className="mt-1.5 h-11 w-full rounded-xl border border-bm-border bg-white px-3 text-sm font-normal text-bm-text"
                >
                  <option value="">Semua kategori</option>
                  {data?.categories.map((item) => (
                    <option key={item.slug} value={item.slug}>
                      {item.label}{item.isActive ? "" : " (nonaktif)"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-bm-brand">
                Urutan tanggal
                <select
                  value={sort}
                  onChange={(event) => {
                    changeQueueFilter(() => {
                      setSort(event.target.value as "asc" | "desc");
                      setPage(1);
                    });
                  }}
                  className="mt-1.5 h-11 w-full rounded-xl border border-bm-border bg-white px-3 text-sm font-normal text-bm-text"
                >
                  <option value="desc">Terbaru</option>
                  <option value="asc">Terlama</option>
                </select>
              </label>
              <button
                type="submit"
                className="rounded-xl bg-bm-brand px-4 py-3 text-sm font-bold text-white hover:bg-bm-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bm-brand sm:col-span-2 xl:col-span-4"
              >
                Terapkan pencarian
              </button>
            </form>
          </div>

          {error ? (
            <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
              {error}
            </div>
          ) : null}
          {loading ? (
            <p className="p-8 text-center text-sm text-bm-muted" role="status">
              Memuat antrean…
            </p>
          ) : null}
          {!loading && !error && data?.queue.items.length === 0 ? (
            <div className="p-10 text-center">
              <p className="font-bold text-bm-brand">Tidak ada kiriman di sini.</p>
              <p className="mt-2 text-sm text-bm-muted">
                Ubah filter atau coba pencarian lain.
              </p>
            </div>
          ) : null}
          {!loading && !error && data?.queue.items.length ? (
            <>
              <ul className="divide-y divide-bm-border">
                {data.queue.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setActionError(undefined);
                        setSelectedId(item.id);
                      }}
                      aria-pressed={selectedId === item.id}
                      className={`block w-full px-5 py-4 text-left transition-colors hover:bg-bm-admin-surface-soft focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-bm-brand md:px-6 ${
                        selectedId === item.id ? "bg-bm-mint/60" : ""
                      }`}
                    >
                      <span className="flex flex-wrap items-center justify-between gap-3">
                        <span className="flex items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusStyle(item.status)}`}>
                            {statusLabels[item.status]}
                          </span>
                          <span className="text-xs font-semibold text-bm-gold">
                            {item.category.label}
                          </span>
                        </span>
                        <time className="text-xs text-bm-muted" dateTime={item.submittedAt}>
                          {formatDate(item.submittedAt)}
                        </time>
                      </span>
                      <span className="mt-3 block whitespace-pre-wrap break-words text-sm leading-6 text-bm-text">
                        {item.message}
                      </span>
                      <span className="mt-2 block text-[11px] text-bm-muted">
                        Referensi internal · {item.id.slice(0, 8)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-3 border-t border-bm-border px-5 py-4">
                <p className="text-xs text-bm-muted">
                  Halaman {data.queue.page} dari {Math.max(data.queue.pageCount, 1)}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() =>
                      changeQueueFilter(() =>
                        setPage((value) => Math.max(1, value - 1)),
                      )
                    }
                    className="rounded-lg border border-bm-border px-3 py-2 text-xs font-bold text-bm-brand disabled:opacity-45"
                  >
                    Sebelumnya
                  </button>
                  <button
                    type="button"
                    disabled={page >= data.queue.pageCount || loading}
                    onClick={() =>
                      changeQueueFilter(() => setPage((value) => value + 1))
                    }
                    className="rounded-lg border border-bm-border px-3 py-2 text-xs font-bold text-bm-brand disabled:opacity-45"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="space-y-6">
          <SubmissionDetail
            detail={selectedDetail}
            selected={Boolean(selectedId)}
            reason={reason}
            onReasonChange={setReason}
            onAction={performAction}
            actionError={actionError}
            acting={acting}
          />
          <RecentActivity activities={data?.recentActivity ?? []} loading={loading} />
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value?: number;
  tone: "green" | "gold" | "mint" | "neutral";
}) {
  const tones = {
    green: "border-l-bm-brand",
    gold: "border-l-bm-accent",
    mint: "border-l-[#8cae9d]",
    neutral: "border-l-[#a9b0aa]",
  };
  return (
    <article className={`rounded-2xl border border-bm-border border-l-4 ${tones[tone]} bg-white p-5 shadow-sm`}>
      <p className="text-xs font-bold uppercase tracking-wide text-bm-muted">{label}</p>
      <p className="mt-3 text-3xl font-extrabold tabular-nums text-bm-brand">
        {value ?? "—"}
      </p>
    </article>
  );
}

function statusStyle(status: Status) {
  if (status === "PENDING") return "bg-amber-50 text-amber-800";
  if (status === "APPROVED") return "bg-emerald-50 text-emerald-800";
  if (status === "PUBLISHED") return "bg-bm-mint text-bm-brand";
  return "bg-stone-100 text-stone-700";
}

function SubmissionDetail({
  detail,
  selected,
  reason,
  onReasonChange,
  onAction,
  actionError,
  acting,
}: {
  detail?: Detail;
  selected: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  onAction: (action: "APPROVE" | "REJECT" | "PUBLISH") => Promise<void>;
  actionError?: string;
  acting: boolean;
}) {
  return (
    <section className="rounded-[22px] border border-bm-border bg-white p-5 shadow-sm md:p-6">
      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-bm-gold">
        Ruang tinjau
      </p>
      <h2 className="mt-2 text-xl font-extrabold text-bm-brand">Detail kiriman</h2>
      {!selected ? (
        <p className="mt-4 rounded-xl bg-bm-admin-surface-soft p-4 text-sm leading-6 text-bm-muted">
          Pilih kiriman dari antrean untuk membaca riwayat dan mengambil tindakan.
        </p>
      ) : null}
      {selected && !detail
        ? actionError
          ? (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
                {actionError}
              </p>
            )
          : (
              <p className="mt-4 text-sm text-bm-muted" role="status">
                Memuat detail…
              </p>
            )
        : null}
      {detail ? (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${statusStyle(detail.status)}`}>
              {statusLabels[detail.status]}
            </span>
            <span className="text-xs font-bold text-bm-gold">{detail.category.label}</span>
          </div>
          <p className="mt-3 text-xs text-bm-muted">
            Dikirim {formatDate(detail.submittedAt)} · versi {detail.version}
          </p>
          <div className="mt-5 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-bm-border bg-[#fdfbf6] p-4 text-sm leading-7 text-bm-text">
            {detail.message}
          </div>
          <p className="mt-3 text-xs leading-5 text-bm-muted">
            {detail.trackingCredentials}
          </p>

          <div className="mt-6 border-t border-bm-border pt-5">
            <h3 className="text-sm font-extrabold text-bm-brand">Riwayat moderasi</h3>
            {detail.moderationLogs.length ? (
              <ol className="mt-3 space-y-3">
                {detail.moderationLogs.map((log) => (
                  <li key={log.id} className="border-l-2 border-bm-accent pl-3">
                    <p className="text-xs font-bold text-bm-brand">
                      {actionLabels[log.action]} · {statusLabels[log.fromStatus]} → {statusLabels[log.toStatus]}
                    </p>
                    <p className="mt-1 text-[11px] text-bm-muted">
                      {log.actor.name} · {formatDate(log.createdAt)}
                    </p>
                    {log.note ? (
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-bm-text">
                        {log.note}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-xs text-bm-muted">Belum ada tindakan moderasi.</p>
            )}
          </div>

          {detail.status !== "REJECTED" && detail.status !== "PUBLISHED" ? (
            <div className="mt-6 space-y-3 border-t border-bm-border pt-5">
              {detail.status === "PENDING" ? (
                <>
                  <label className="block text-xs font-bold text-bm-brand" htmlFor="moderation-reason">
                    Alasan penolakan <span className="font-normal text-bm-muted">(wajib jika menolak)</span>
                    <textarea
                      id="moderation-reason"
                      value={reason}
                      onChange={(event) => onReasonChange(event.target.value)}
                      maxLength={1_000}
                      rows={3}
                      className="mt-2 w-full resize-y rounded-xl border border-bm-border px-3 py-2.5 text-sm font-normal text-bm-text outline-none focus:border-bm-brand focus:ring-2 focus:ring-bm-brand/15"
                      placeholder="Jelaskan alasan penolakan secara singkat dan profesional."
                    />
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={acting}
                      onClick={() => void onAction("APPROVE")}
                      className="rounded-xl bg-bm-brand px-4 py-3 text-sm font-bold text-white hover:bg-bm-deep disabled:opacity-50"
                    >
                      Setujui
                    </button>
                    <button
                      type="button"
                      disabled={acting || !reason.trim()}
                      onClick={() => void onAction("REJECT")}
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800 hover:bg-red-100 disabled:opacity-50"
                    >
                      Tolak kiriman
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => void onAction("PUBLISH")}
                  className="w-full rounded-xl bg-bm-brand px-4 py-3 text-sm font-bold text-white hover:bg-bm-deep disabled:opacity-50"
                >
                  Tandai dipublikasikan
                </button>
              )}
              {actionError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800" role="alert">
                  {actionError}
                </p>
              ) : null}
            </div>
          ) : null}
          {detail.status === "PUBLISHED" ? (
            <p className="mt-5 rounded-xl bg-bm-mint p-3 text-xs leading-5 text-bm-brand">
              Status ini final pada model alur saat ini. Pembatalan publikasi belum didukung.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function RecentActivity({
  activities,
  loading,
}: {
  activities: Activity[];
  loading: boolean;
}) {
  return (
    <section
      id="recent-activity"
      className="scroll-mt-24 rounded-[22px] border border-bm-border bg-white p-5 shadow-sm md:p-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-extrabold text-bm-brand">Aktivitas terbaru</h2>
        <span className="text-[11px] font-semibold text-bm-muted">Audit moderasi</span>
      </div>
      {loading && !activities.length ? (
        <p className="mt-4 text-sm text-bm-muted">Memuat aktivitas…</p>
      ) : null}
      {!loading && !activities.length ? (
        <p className="mt-4 rounded-xl bg-bm-admin-surface-soft p-4 text-sm text-bm-muted">
          Belum ada aktivitas moderasi.
        </p>
      ) : null}
      {activities.length ? (
        <ol className="mt-4 space-y-4">
          {activities.map((activity) => (
            <li key={activity.id} className="flex gap-3">
              <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-bm-accent" />
              <div className="min-w-0">
                <p className="text-xs leading-5 text-bm-text">
                  <span className="font-bold">{activity.actor.name}</span>{" "}
                  {actionLabels[activity.action].toLowerCase()}{" "}
                  <span className="font-mono text-bm-muted">{activity.menfessId.slice(0, 8)}</span>
                </p>
                <p className="mt-1 text-[11px] text-bm-muted">
                  {statusLabels[activity.fromStatus]} → {statusLabels[activity.toStatus]} · {formatDate(activity.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
