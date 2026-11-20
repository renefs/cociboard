import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The element the print stylesheet shows instead of the app; created once, empty when idle. */
export function printRoot(): HTMLElement {
  const existing = document.querySelector<HTMLElement>("body > .print-root");
  if (existing) return existing;
  const root = document.createElement("div");
  root.className = "print-root";
  document.body.append(root);
  return root;
}

interface PrintPortalProps {
  children: ReactNode;
  /** Called after printing (the dialog closed or the job was cancelled). */
  onDone: () => void;
}

/**
 * Renders print-only content into the print root and opens the print dialog once it is on the
 * page. Mount it to print, unmount it (`onDone`) afterwards: the content must not linger.
 */
export function PrintPortal({ children, onDone }: PrintPortalProps) {
  const [root] = useState(printRoot);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  // Once per mount: a re-render must not open the print dialog again.
  useEffect(() => {
    const finished = () => doneRef.current();
    window.addEventListener("afterprint", finished);
    // One frame, so that the content is laid out when the dialog takes its snapshot.
    const frame = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", finished);
    };
  }, []);

  return createPortal(children, root);
}

/** Print state for a component: `print()` starts a job, render `job` for the portal. */
export function usePrintJob(): { job: number | null; print: () => void; done: () => void } {
  const [job, setJob] = useState<number | null>(null);
  return {
    job,
    // A new key restarts the job when it is requested again while one is still showing.
    print: () => setJob((current) => (current ?? 0) + 1),
    done: () => setJob(null),
  };
}
