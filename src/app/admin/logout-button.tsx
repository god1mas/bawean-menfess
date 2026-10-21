import { signOutAction } from "@/app/admin/logout";

export function LogoutButton() {
  return (
    <form action={signOutAction}>
      <button
        className="rounded-xl border border-bm-border px-4 py-2 text-sm font-semibold text-bm-brand"
        type="submit"
      >
        Keluar
      </button>
    </form>
  );
}
