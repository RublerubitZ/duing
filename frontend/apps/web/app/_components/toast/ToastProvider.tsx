'use client';

// 가벼운 토스트 시스템. 컨텍스트로 addToast 를 제공하고, 포털로 화면 상단에 알림을 띄운다.
// 세션 만료 안내 등 비동기 콜백(SessionExpiryHandler)에서도 useToast 로 호출한다.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/app/_lib/cn';
import { X } from '@/components/duing/Icon';

type ToastVariant = 'info' | 'error';

type Toast = { id: number; message: string; variant: ToastVariant };

type AddToastOptions = { variant?: ToastVariant; durationMs?: number };

type ToastContextValue = {
  addToast: (message: string, options?: AddToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 5000;

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast 는 ToastProvider 안에서만 사용할 수 있습니다.');
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, options?: AddToastOptions) => {
      const id = (nextId.current += 1);
      setToasts((current) => [...current, { id, message, variant: options?.variant ?? 'info' }]);
      const duration = options?.durationMs ?? DEFAULT_DURATION_MS;
      if (duration > 0) {
        timers.current.set(id, setTimeout(() => dismissToast(id), duration));
      }
    },
    [dismissToast],
  );

  // 언마운트 시 보류 중인 자동 닫기 타이머를 모두 정리한다.
  useEffect(() => {
    const pendingTimers = timers.current;
    return () => {
      pendingTimers.forEach(clearTimeout);
      pendingTimers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  // 포털은 클라이언트에서만 — SSR 하이드레이션 불일치를 피한다.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="duing pointer-events-none fixed inset-x-0 top-0 z-[80] flex flex-col items-center gap-2 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          // role 이 암묵적 live region 을 부여한다(alert=assertive, status=polite). 별도 aria-live 중복 선언은 피한다.
          role={toast.variant === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-[14px] px-4 py-3 shadow-3',
            'animate-in slide-in-from-top-2 fade-in-0 motion-reduce:animate-none',
            'bg-ink-deep text-cream',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              toast.variant === 'error' ? 'bg-coral' : 'bg-sage',
            )}
          />
          <span className="flex-1 text-[13.5px] leading-snug">{toast.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="알림 닫기"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-cream/70 transition hover:bg-white/10 hover:text-cream"
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
