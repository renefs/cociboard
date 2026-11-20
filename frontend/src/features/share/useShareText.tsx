import { useState, type ReactNode } from "react";
import { ManualCopyDialog } from "./ManualCopyDialog";
import { shareOrCopy } from "./shareActions";

type Notify = (kind: "error" | "info", text: string) => void;

interface ShareRequest {
  title: string;
  text: string;
  /** Toast shown when the text went to the clipboard. */
  copiedMessage: string;
}

/**
 * Share a text and report how it went: a toast when it was copied, a dialog with the text to
 * select when nothing else worked. Render `dialog` somewhere in the component.
 */
export function useShareText(onNotify: Notify): { share: (request: ShareRequest) => Promise<void>; dialog: ReactNode } {
  const [manual, setManual] = useState<{ title: string; text: string } | null>(null);

  const share = async ({ title, text, copiedMessage }: ShareRequest) => {
    const outcome = await shareOrCopy({ title, text });
    if (outcome === "copied") onNotify("info", copiedMessage);
    else if (outcome === "manual") setManual({ title, text });
  };

  const dialog = manual && <ManualCopyDialog title={manual.title} text={manual.text} onClose={() => setManual(null)} />;
  return { share, dialog };
}
