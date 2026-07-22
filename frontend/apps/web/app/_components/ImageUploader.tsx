'use client';

import { useRef, useState } from 'react';
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
  aspectRatio?: '1/1' | '16/9' | '4/3' | '3/4';
  placeholder?: string;
  altText?: string;
  /** true 면 미리보기 없이 업로드·제거 컨트롤만 렌더 — 미리보기를 호출부가 따로 그리는 히어로 칩 레이아웃용. */
  controlsOnly?: boolean;
};

const ASPECT_CLASS: Record<NonNullable<Props['aspectRatio']>, string> = {
  '1/1': 'aspect-square',
  '16/9': 'aspect-[16/9]',
  '4/3': 'aspect-[4/3]',
  '3/4': 'aspect-[3/4]',
};

export function ImageUploader({
  value,
  onChange,
  purpose,
  aspectRatio = '16/9',
  placeholder = '이미지를 업로드하세요',
  altText = '대표 이미지',
  controlsOnly = false,
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

  return (
    <div className="space-y-2">
      {!controlsOnly && (
        <ImageWithFallback
          src={value}
          alt={altText}
          className={cn(ASPECT_CLASS[aspectRatio], 'rounded-xl overflow-hidden border border-line')}
          emptyMessage={placeholder}
        />
      )}
      <div className="flex gap-2">
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
