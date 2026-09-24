import { cloneElement, type ReactElement, type ReactNode } from 'react';

type FieldControlProps = {
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
};

type FieldProps = {
  id: string;
  label: ReactNode;
  required?: boolean;
  error?: string;
  labelClassName?: string;
  // 입력과 오류 사이에 두는 보조 문구(예: 수정 모드 안내). 오류 연결 대상은 아니다.
  hint?: ReactNode;
  // 같은 id 를 가진 단일 입력(input/select/textarea). 오류 시 aria-invalid·aria-describedby 를 주입한다.
  children: ReactElement<FieldControlProps>;
};

// 폼 필드 공용 래퍼 — 검증 오류 문구를 입력에 연결해 스크린리더가 찾게 한다.
// 필드 오류는 라이브 리전(role=alert)으로 읽히지 않게 둔다(포커스 시 설명으로 읽힘).
export function Field({
  id,
  label,
  required,
  error,
  labelClassName = 'mb-1.5 block text-sm font-semibold text-ink',
  hint,
  children,
}: FieldProps) {
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className={labelClassName}>
        {label}
        {required && (
          <>
            {' '}
            <span className="text-coral">*</span>
          </>
        )}
      </label>
      {cloneElement(children, {
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : undefined,
      })}
      {hint}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-coral">
          {error}
        </p>
      )}
    </div>
  );
}
