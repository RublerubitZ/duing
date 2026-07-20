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

// Provider 밖(예: 테스트의 얕은 렌더)에서도 안전하게 쓰는 선택적 접근자.
// 가드 라우터처럼 "토스트는 부가 피드백"인 소비자용 — 없으면 null 을 반환하고 throw 하지 않는다.
export function useOptionalToast(): ToastContextValue['addToast'] | null {
  const context = useContext(ToastContext);
  return context ? context.addToast : null;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  // toasts state 의 미러 — dedupe 판별을 위해 "지금 떠 있는 토스트" 를 동기적으로 읽어야 하는데,
  // setState 함수형 업데이터는 React(StrictMode)가 개발 모드에서 두 번 호출할 수 있어 그 안에
  // 타이머 등록 같은 부수효과를 두면 타이머가 중복 등록된다. 그래서 판별은 이 ref 로,
  // 부수효과(타이머)는 판별 이후 별도로 수행한다.
  const toastsRef = useRef<Toast[]>([]);

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    toastsRef.current = toastsRef.current.filter((toast) => toast.id !== id);
    setToasts(toastsRef.current);
  }, []);

  const addToast = useCallback(
    (message: string, options?: AddToastOptions) => {
      const variant = options?.variant ?? 'info';
      // 동일 문구+variant 토스트가 이미 표시 중이면 추가하지 않는다(연타 시 중복 스택 방지).
      // 스킵할 때는 id 발급·타이머 등록 모두 건너뛴다 — 그러지 않으면 이미 떠 있는 토스트를
      // 조기/중복 닫는 타이머가 새로 걸릴 수 있다.
      const isAlreadyShown = toastsRef.current.some(
        (toast) => toast.message === message && toast.variant === variant,
      );
      if (isAlreadyShown) return;

      const id = (nextId.current += 1);
      toastsRef.current = [...toastsRef.current, { id, message, variant }];
      setToasts(toastsRef.current);

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

// 모바일 하단 배치가 비켜야 할 높이를 실측한다. 화면마다 하단 고정 UI 가 달라
// (탭바 없음 / 탭바 / 상세 액션 바 / 탭바+예약 액션 바 / 바텀시트 푸터) 상수로는 맞출 수 없고,
// 상수를 쓰면 토스트(z-[80])가 그보다 낮은 z-index 인 그 바들의 주 CTA 를 덮어 탭까지 막는다.
// 그래서 `data-bottom-bar` 를 단 요소들의 실제 위치를 읽어 그중 가장 위를 기준으로 잡는다.
// 새 하단 바는 이 속성만 달면 되고 여기는 손대지 않는다.
export function measureBottomInset(): number {
  const viewportHeight = window.innerHeight;

  // 화면에 실제로 그려진 것만 — 반응형으로 꺼진 바(md:hidden 등)는 rect 가 전부 0 이라 걸러진다.
  let topmost = viewportHeight;
  document.querySelectorAll('[data-bottom-bar]').forEach((bar) => {
    const { top, height } = bar.getBoundingClientRect();
    if (height > 0) topmost = Math.min(topmost, top);
  });
  const barInset = viewportHeight - topmost;

  // iOS 는 키보드가 떠도 layout viewport 가 줄지 않아 fixed 하단 요소가 키보드 뒤로 들어간다.
  // visual viewport 와의 차이가 곧 키보드(+ 하단 브라우저 UI)가 가린 높이다.
  const visual = window.visualViewport;
  const keyboardInset = visual
    ? Math.max(0, viewportHeight - visual.height - visual.offsetTop)
    : 0;

  return Math.max(0, barInset, keyboardInset);
}

function useBottomInset(active: boolean): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!active) return;

    const remeasure = () => setInset(measureBottomInset());
    remeasure();

    // 토스트가 떠 있는 동안 아래 지형이 바뀌는 경우가 실제로 있다 — 시설 예약의 무효 딥링크는
    // 토스트를 띄우면서 같은 흐름에서 뷰를 전환해 액션 바를 새로 만든다. 표시 중(수 초)에만
    // 도는 폴링으로 따라간다. 값이 그대로면 setState 가 bail out 하므로 리렌더도 없다.
    // ponytail: 250ms 폴링. 더 정밀한 추적이 필요해지면 MutationObserver 로 바꾼다.
    const poll = setInterval(remeasure, 250);

    const visual = window.visualViewport;
    window.addEventListener('resize', remeasure);
    visual?.addEventListener('resize', remeasure);
    visual?.addEventListener('scroll', remeasure);
    return () => {
      clearInterval(poll);
      window.removeEventListener('resize', remeasure);
      visual?.removeEventListener('resize', remeasure);
      visual?.removeEventListener('scroll', remeasure);
    };
  }, [active]);

  return inset;
}

function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  // 포털은 클라이언트에서만 — SSR 하이드레이션 불일치를 피한다.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const bottomInset = useBottomInset(mounted && toasts.length > 0);
  if (!mounted) return null;

  return createPortal(
    // `.duing` 스코프는 토스트 카드의 폰트·디자인 토큰을 위해 유지하되, 이 스코프가 함께 거는
    // `bg-cream` 은 명시적으로 끈다(bg-transparent). 이 컨테이너는 전폭 고정 오버레이라
    // 배경이 칠해지면 토스트가 없어도 화면 가장자리에 크림색 가로 띠로 보인다.
    // 실제 배경은 각 토스트 카드(bg-ink-deep)가 가지므로 컨테이너는 투명해야 한다.
    //
    // 위치는 반응형: 모바일(<md)은 시선이 머무는 하단, md 이상은 기존대로 상단.
    // 하단 오프셋은 아래 스페이서가 만든다 — 실측값(px)을 inline style 로 주면서도
    // md 분기는 순수 클래스로 남겨야 하기 때문(컨테이너에 inline bottom 을 주면 md:top-0 을 이긴다).
    <div
      className={cn(
        'duing pointer-events-none fixed inset-x-0 z-[80] flex flex-col items-center gap-2 bg-transparent px-4',
        'bottom-0 pb-3',
        'md:bottom-auto md:top-0 md:pb-0 md:pt-[calc(0.75rem+env(safe-area-inset-top))]',
      )}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          // role 이 암묵적 live region 을 부여한다(alert=assertive, status=polite). 별도 aria-live 중복 선언은 피한다.
          role={toast.variant === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-[14px] px-4 py-3 shadow-3',
            // 등장 방향도 위치를 따라간다(모바일은 아래에서, md 이상은 위에서).
            'animate-in slide-in-from-bottom-2 md:slide-in-from-top-2 fade-in-0 motion-reduce:animate-none',
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
      {/* 하단 고정 UI 를 비켜서는 자리. 실측값이 0(하단에 아무것도 없는 화면)이어도 safe-area 는
          확보해야 하므로 min-height 로 하한을 둔다 — 바가 있으면 그 바가 이미 safe-area 를
          포함하고 있어 실측값에 반영되므로 이중 가산되지 않는다. */}
      <div
        aria-hidden
        style={{ height: bottomInset }}
        className="min-h-[env(safe-area-inset-bottom)] w-full shrink-0 md:hidden"
      />
    </div>,
    document.body,
  );
}
