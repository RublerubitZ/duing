'use client';

import { useRef } from 'react';
import { useFileUploadMutation } from '@duing/hooks';

type Props = {
  value: string;
  onChange: (url: string) => void;
};

export function PromotionBannerUploader({ value, onChange }: Props) {
  const uploadMutation = useFileUploadMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelect = async (file: File) => {
    const result = await uploadMutation.mutateAsync({ file, purpose: 'PROMOTION_BANNER' });
    onChange(result.url);
  };

  return (
    <div className="space-y-2">
      <div className="relative aspect-[16/9] rounded-xl overflow-hidden bg-graysoft border border-line">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- 사용자 업로드 스토리지 URL (Local / Supabase Storage)
          <img src={value} alt="배너 이미지" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-charcoal-3 text-[13px]">
            배너 이미지를 업로드하세요
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleSelect(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="px-3 py-1.5 rounded-md bg-paper border border-line text-[13px] font-semibold hover:border-ink disabled:opacity-50"
        >
          {uploadMutation.isPending ? '업로드 중…' : value ? '교체' : '업로드'}
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
      {uploadMutation.isError && (
        <p className="text-red-500 text-[12px]">업로드 실패. 다시 시도해주세요.</p>
      )}
    </div>
  );
}
