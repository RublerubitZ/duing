'use client';

import { useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useFileUploadMutation } from '@duing/hooks';
import type { FilePurpose } from '@duing/types';
import { cn } from '@/app/_lib/cn';
import { Spinner } from '@/components/loading/Spinner';
import { IMAGE_UPLOAD_POLICY, validateImageFile } from './imageUploadPolicy';
import { ImageWithFallback } from './ImageWithFallback';

type Props = {
  value: string;
  onChange: (url: string) => void;
  purpose: FilePurpose;
  aspectRatio?: '1/1' | '16/9' | '4/3' | '3/4' | '4/5';
  placeholder?: string;
  altText?: string;
  /**
   * 'stacked'(기본) — 미리보기 아래 텍스트 버튼(교체/제거) 행. 일반 폼 필드용.
   * 'floating' — 미리보기 위 우측 상단에 글래스모피즘 아이콘 버튼을 얹는 히어로용.
   */
  variant?: 'stacked' | 'floating';
  /** floating 전용 — 로고 칩처럼 좁은 영역에서 버튼을 28px 로 축소한다(히트 영역 44px 유지). */
  dense?: boolean;
  /** floating 전용 — 미리보기 요소 클래스 오버라이드(기본은 커버용 rounded-xl + border-line). */
  previewClassName?: string;
};

const ASPECT_CLASS: Record<NonNullable<Props['aspectRatio']>, string> = {
  '1/1': 'aspect-square',
  '16/9': 'aspect-[16/9]',
  '4/3': 'aspect-[4/3]',
  '3/4': 'aspect-[3/4]',
  '4/5': 'aspect-[4/5]',
};

export function ImageUploader({
  value,
  onChange,
  purpose,
  aspectRatio = '16/9',
  placeholder = '이미지를 업로드하세요',
  altText = '대표 이미지',
  variant = 'stacked',
  dense = false,
  previewClassName,
}: Props) {
  const uploadMutation = useFileUploadMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSelect = async (file: File) => {
    setLocalError(null);
    const validationError = validateImageFile(file);
    if (validationError) {
      setLocalError(validationError);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    try {
      const result = await uploadMutation.mutateAsync({ file, purpose });
      onChange(result.url);
    } catch {
      // 업로드 실패(백엔드 400, 네트워크 오류 등) 는 uploadMutation.isError /
      // uploadMutation.error 에 담겨 displayError 로 노출됨. catch 없으면
      // unhandled rejection 이 콘솔 에러 + 잔여 부작용을 남기므로 swallow 가 의도된 동작.
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const serverError =
    uploadMutation.isError && uploadMutation.error instanceof Error
      ? uploadMutation.error.message
      : null;
  const displayError = localError ?? serverError;

  const fileInput = (
    <input
      ref={fileInputRef}
      data-testid="image-uploader-input"
      type="file"
      accept={IMAGE_UPLOAD_POLICY.acceptAttribute}
      className="hidden"
      onChange={(changeEvent) => {
        const file = changeEvent.target.files?.[0];
        if (file) void handleSelect(file);
      }}
    />
  );

  if (variant === 'floating') {
    const previewCls = previewClassName ?? 'rounded-xl border border-line';
    // 보이는 버튼은 작아도 before 유사요소로 히트 영역을 44px 이상 확장한다.
    const buttonBase = cn(
      'relative inline-flex items-center justify-center rounded-full',
      'border border-line bg-white/85 text-charcoal-2 shadow-sm backdrop-blur',
      'transition disabled:pointer-events-none disabled:opacity-50',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
      "before:absolute before:rounded-full before:content-['']",
      dense
        ? 'h-7 w-7 before:-inset-2' // 28px → 히트 44px
        : 'h-10 w-10 before:-inset-1 md:h-9 md:w-9', // 40/36px → 히트 48/44px
    );
    const iconSize = dense ? 14 : 18;

    return (
      <div className="group relative">
        <ImageWithFallback
          src={value}
          alt={altText}
          className={cn(ASPECT_CLASS[aspectRatio], 'overflow-hidden', previewCls)}
          emptyMessage={placeholder}
        />
        {fileInput}
        <div
          className={cn(
            'absolute flex',
            // dense 도 gap-2 — 히트 확장(before:-inset-2)이 이웃 버튼 가시 표면을 덮어 오클릭(제거)되는 것 방지.
            dense ? 'right-1 top-1 gap-2' : 'right-2 top-2 gap-2',
            // 모바일(hover 없음)은 항상 노출, md+ 는 컨테이너 hover·키보드 포커스 시 등장.
            'translate-y-0 opacity-100',
            'md:-translate-y-1 md:opacity-0',
            'md:group-hover:translate-y-0 md:group-hover:opacity-100',
            'md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100',
            'motion-safe:transition motion-safe:duration-200',
          )}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            title="이미지 교체"
            aria-label="이미지 교체"
            className={cn(buttonBase, 'hover:text-primary motion-safe:hover:scale-105')}
          >
            {uploadMutation.isPending ? (
              <span role="status" aria-label="업로드 중">
                <Spinner size={iconSize} />
              </span>
            ) : (
              <Pencil size={iconSize} aria-hidden />
            )}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={uploadMutation.isPending}
              title="이미지 제거"
              aria-label="이미지 제거"
              className={cn(buttonBase, 'hover:text-red-500 motion-safe:hover:scale-105')}
            >
              <Trash2 size={iconSize} aria-hidden />
            </button>
          )}
        </div>
        {displayError && (
          <p
            className={cn(
              'text-[12px] text-red-500',
              // 로고 칩은 좁아 내부 렌더가 잘리므로 칩 아래 바깥으로 띄운다.
              dense ? 'absolute left-0 top-full z-10 mt-1 w-max max-w-[240px]' : 'mt-2',
            )}
          >
            {displayError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ImageWithFallback
        src={value}
        alt={altText}
        className={cn(ASPECT_CLASS[aspectRatio], 'rounded-xl overflow-hidden border border-line')}
        emptyMessage={placeholder}
      />
      <div className="flex gap-2">
        {fileInput}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="px-3 py-1.5 rounded-md bg-paper border border-line text-[13px] font-semibold hover:border-ink disabled:opacity-50"
        >
          {uploadMutation.isPending ? (
            // 파일 업로드는 장시간 작업 — 스피너 + 안내 문구를 함께 유지한다.
            <span role="status" className="inline-flex items-center gap-1.5">
              <Spinner size={14} className="shrink-0" />
              업로드 중…
            </span>
          ) : value ? (
            '교체'
          ) : (
            '업로드'
          )}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="px-3 py-1.5 rounded-md text-[13px] text-charcoal-2 hover:bg-graysoft"
          >
            제거
          </button>
        )}
      </div>
      {displayError && (
        <p className="text-red-500 text-[12px]">{displayError}</p>
      )}
    </div>
  );
}
