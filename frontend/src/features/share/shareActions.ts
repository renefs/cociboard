// Thin wrappers over the browser's sharing, clipboard and download APIs. Everything that can
// be missing (the Web Share API, the clipboard on plain-http origins) is feature-detected.

export type ShareOutcome = "shared" | "copied" | "manual" | "cancelled";

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

/** Whether `shareOrCopy` can open the system share sheet (it falls back to the clipboard). */
export function canShareText(): boolean {
  return typeof navigator.share === "function";
}

/**
 * Share the text through the system sheet, else copy it to the clipboard. "manual" means
 * neither worked (the clipboard API needs a secure context, so plain-http LAN access has
 * none): the caller shows the text to be selected and copied by hand.
 */
export async function shareOrCopy({ title, text }: { title: string; text: string }): Promise<ShareOutcome> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch (error) {
      // Dismissing the sheet is not an error; anything else falls through to the clipboard.
      if (isAbortError(error)) return "cancelled";
    }
  }
  if (typeof navigator.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return "copied";
    } catch {
      // Permission denied or insecure context: fall through.
    }
  }
  return "manual";
}

export type FileOutcome = "shared" | "downloaded" | "cancelled";

function isTouchDevice(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Hand a file to the user. Touch devices that can share files get the share sheet (how iOS
 * and Android pass a .ics file to the calendar app); everything else downloads it.
 */
export async function shareOrDownloadFile(file: File): Promise<FileOutcome> {
  if (isTouchDevice() && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return "shared";
    } catch (error) {
      if (isAbortError(error)) return "cancelled";
      // Any other failure: download instead.
    }
  }
  downloadFile(file);
  return "downloaded";
}

/** Download through a temporary link; the object URL is revoked afterwards. */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking at once can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
