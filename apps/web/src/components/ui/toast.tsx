"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, X } from "lucide-react";

type Notice = { id: number; message: string };
const ToastContext = createContext<((message: string) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const sequence = useRef(0);
  const show = useCallback((message: string) => {
    setNotice({ id: ++sequence.current, message });
  }, []);
  const dismiss = useCallback(() => setNotice(null), []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div role="status" aria-live="polite" aria-atomic="true">
        {notice && <Toast key={notice.id} message={notice.message} dismiss={dismiss} />}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ message, dismiss }: { message: string; dismiss: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(8000);
  useEffect(() => {
    if (hovered || focused) return;
    const started = performance.now();
    const timer = window.setTimeout(dismiss, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (performance.now() - started));
    };
  }, [hovered, focused, dismiss]);
  return (
    <div
      className="review-toast"
      aria-label="Review confirmation"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <CheckCircle2 size={18} aria-hidden="true" />
      <span>{message}</span>
      <button
        type="button"
        className="toast-dismiss"
        aria-label="Dismiss confirmation"
        onClick={dismiss}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast requires ToastProvider");
  return show;
}
