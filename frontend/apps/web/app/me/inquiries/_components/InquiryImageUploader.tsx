'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useFileUploadMutation } from '@duing/hooks';

import { extractErrorMessage } from '@/app/_lib/extractErrorMessage';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { IMAGE_UPLOAD_POLICY } from '@/app/_components/imageUploadPolicy';
import { X } from '@/components/duing/Icon';

const MAX_ATTACHMENTS = 5;

type InquiryImageUploaderProps = {
  attachmentUrls: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
};

export function InquiryImageUploader({
  attachmentUrls,
  onChange,
  disabled = false,
}: InquiryImageUploaderProps) {
  const { addToast } = useToast();
  const uploadMutation = useFileUploadMutation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  // 서버 공개 URL → 로컬 objectURL. 비밀성 계약: 뷰어(썸네일)는 이 로컬 objectURL만 사용하고
  // 서버 URL을 <img src>에 직접 넣지 않는다.
  const [previewByUrl, setPreviewByUrl] = useState<Map<string, string>>(new Map());
  const previewByUrlRef = useRef(previewByUrl);

  useEffect(() => {
    previewByUrlRef.current = previewByUrl;
  }, [previewByUrl]);

  // 언마운트 시 이 인스턴스가 만든 objectURL을 전부 revoke한다. 마운트 시 1회만 등록해
  // previewByUrl이 갱신될 때마다 cleanup이 재실행되며 아직 쓰이는 URL까지 revoke되는 것을 막는다.
  useEffect(() => {
    return () => {
      previewByUrlRef.current.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    };
  }, []);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    event.target.value = '';
    if (!fileList || fileList.length === 0) return;

    const selectedFiles = Array.from(fileList);
    const availableSlots = MAX_ATTACHMENTS - attachmentUrls.length;

    if (availableSlots <= 0) {
      addToast('첨부는 최대 5장까지 가능해요', { variant: 'error' });
      return;
    }

    const filesToUpload = selectedFiles.slice(0, availableSlots);
    if (selectedFiles.length > filesToUpload.length) {
      addToast('첨부는 최대 5장까지 가능해요', { variant: 'error' });
    }

    setIsUploading(true);
    let workingUrls = attachmentUrls;
    for (const file of filesToUpload) {
      if (file.size > IMAGE_UPLOAD_POLICY.maxBytes) {
        addToast('5MB 이하 이미지만 업로드할 수 있어요', { variant: 'error' });
        continue;
      }
      try {
        const uploaded = await uploadMutation.mutateAsync({ file, purpose: 'FEDERATION_INQUIRY' });
        const previewUrl = URL.createObjectURL(file);
        setPreviewByUrl((prev) => new Map(prev).set(uploaded.url, previewUrl));
        workingUrls = [...workingUrls, uploaded.url];
        onChange(workingUrls);
      } catch (uploadError) {
        addToast(extractErrorMessage(uploadError) ?? '이미지 업로드에 실패했어요', { variant: 'error' });
      }
    }
    setIsUploading(false);
  }

  function handleRemove(urlToRemove: string) {
    const previewUrl = previewByUrl.get(urlToRemove);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewByUrl((prev) => {
      const next = new Map(prev);
      next.delete(urlToRemove);
      return next;
    });
    onChange(attachmentUrls.filter((url) => url !== urlToRemove));
  }

  const isDisabled = disabled || isUploading;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {attachmentUrls.map((url) => {
          const previewUrl = previewByUrl.get(url);
          return (
            <div
              key={url}
              className="relative h-20 w-20 overflow-hidden rounded-lg border border-line bg-graysoft"
            >
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- 로컬 objectURL 미리보기(비밀성 계약: 서버 URL 미사용).
                <img
                  src={previewUrl}
                  alt="첨부 이미지 미리보기"
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full w-full place-items-center px-1 text-center text-[11px] text-charcoal-3">
                  미리보기 없음
                </div>
              )}
              <button
                type="button"
                onClick={() => handleRemove(url)}
                disabled={isDisabled}
                aria-label="첨부 이미지 삭제"
                className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-ink-deep/70 text-cream disabled:opacity-50"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}

        {attachmentUrls.length < MAX_ATTACHMENTS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isDisabled}
            className="grid h-20 w-20 place-items-center rounded-lg border border-dashed border-line text-[12px] text-charcoal-2 hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUploading ? '업로드 중…' : '+ 사진 추가'}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        data-testid="inquiry-image-uploader-input"
        type="file"
        accept="image/*"
        multiple
        disabled={isDisabled}
        onChange={handleFileChange}
        className="hidden"
      />
      <p className="text-[12px] text-charcoal-3">이미지 최대 5장 · 장당 5MB 이하</p>
    </div>
  );
}
