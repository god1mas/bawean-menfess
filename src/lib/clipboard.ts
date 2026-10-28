export type ClipboardWriter = Pick<Clipboard, "writeText">;

export async function copyText(
  value: string,
  clipboard: ClipboardWriter | undefined = navigator.clipboard,
) {
  if (!clipboard?.writeText) {
    throw new Error("Clipboard API is unavailable.");
  }

  await clipboard.writeText(value);
}
