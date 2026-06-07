'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type {
  AdminPromotionSummary,
  CreatePromotionPayload,
  PromotionPalette,
  PromotionRenderMode,
  UpdatePromotionPayload,
} from '@duing/types';
import { ImageUploader } from '../../../_components/ImageUploader';
import { PALETTE_OPTIONS, PROMOTION_PALETTE } from '../../../_lib/promotionPalette';
import { ClubSelector } from './ClubSelector';

type CreateMode = {
  mode: 'create';
  initialValues?: undefined;
  onSubmit: (payload: CreatePromotionPayload) => Promise<void>;
};

type EditMode = {
  mode: 'edit';
  initialValues: AdminPromotionSummary;
  onSubmit: (payload: UpdatePromotionPayload) => Promise<void>;
};

type Props = (CreateMode | EditMode) & {
  isSubmitting: boolean;
  errorMessage?: string | null;
};

type ScheduleMode = 'ALWAYS' | 'SCHEDULED';

type FormState = {
  title: string;
  bannerImageUrl: string;
  linkUrl: string;
  isCuration: boolean;
  clubId: number | null;
  clubName: string | null;
  active: boolean;
  displayOrder: string;
  palette: PromotionPalette;
  tag: string;
  subtitle: string;
  ctaLabel: string;
  emoji: string;
  scheduleMode: ScheduleMode;
  /** datetime-local 입력값 — "YYYY-MM-DDTHH:mm" 형식. 빈 문자열 = 미지정. */
  startAt: string;
  endAt: string;
  renderMode: PromotionRenderMode;
  imageAltText: string;
};

/**
 * 서버의 ISO 문자열 ("2026-06-01T09:00:00") 을 datetime-local input 이 받아들이는
 * "YYYY-MM-DDTHH:mm" 형식으로 자른다.
 */
function toDateTimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 16);
}

function buildInitialState(initialValues?: AdminPromotionSummary): FormState {
  if (!initialValues) {
    return {
      title: '',
      bannerImageUrl: '',
      linkUrl: '',
      isCuration: true,
      clubId: null,
      clubName: null,
      active: true,
      displayOrder: '0',
      palette: 'INK',
      tag: '',
      subtitle: '',
      ctaLabel: '',
      emoji: '',
      scheduleMode: 'ALWAYS',
      startAt: '',
      endAt: '',
      renderMode: 'SYSTEM_COMPOSED',
      imageAltText: '',
    };
  }
  const hasSchedule = initialValues.startAt !== null || initialValues.endAt !== null;
  return {
    title: initialValues.title,
    bannerImageUrl: initialValues.bannerImageUrl ?? '',
    linkUrl: initialValues.linkUrl ?? '',
    isCuration: initialValues.club === null,
    clubId: initialValues.club?.id ?? null,
    clubName: initialValues.club?.name ?? null,
    active: initialValues.active,
    displayOrder: String(initialValues.displayOrder),
    palette: initialValues.palette,
    tag: initialValues.tag ?? '',
    subtitle: initialValues.subtitle ?? '',
    ctaLabel: initialValues.ctaLabel ?? '',
    emoji: initialValues.emoji ?? '',
    scheduleMode: hasSchedule ? 'SCHEDULED' : 'ALWAYS',
    startAt: toDateTimeLocalValue(initialValues.startAt),
    endAt: toDateTimeLocalValue(initialValues.endAt),
    renderMode: initialValues.renderMode,
    imageAltText: initialValues.imageAltText ?? '',
  };
}

export function AdminPromotionForm(props: Props) {
  const { mode, isSubmitting, errorMessage } = props;
  const [state, setState] = useState<FormState>(() =>
    buildInitialState(mode === 'edit' ? props.initialValues : undefined),
  );

  // 권장 비율(1920×840, 16:7) 측정 — FULL_BLEED 모드에서만 경고 노출.
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!state.bannerImageUrl) {
      setImageDimensions(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => setImageDimensions(null);
    img.src = state.bannerImageUrl;
  }, [state.bannerImageUrl]);

  const imageSizeWarning = (() => {
    if (state.renderMode !== 'FULL_BLEED_IMAGE') return null;
    if (!imageDimensions) return null;
    const { width, height } = imageDimensions;
    const shortSide = Math.min(width, height);
    const ratio = width / height;
    const targetRatio = 16 / 7;
    const tolerancePercent = 0.1;
    const ratioOff = Math.abs(ratio - targetRatio) / targetRatio > tolerancePercent;
    const tooSmall = shortSide < 840;
    if (!ratioOff && !tooSmall) return null;
    return '권장 사이즈(1920×840, 16:7) 와 다릅니다 — 모바일에서 이미지 일부가 잘릴 수 있습니다.';
  })();

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const trimToNull = (value: string): string | null => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const clubId = state.isCuration ? null : state.clubId;
    const displayOrderValue = Number(state.displayOrder);
    const bannerImage = trimToNull(state.bannerImageUrl);
    const linkUrlValue = trimToNull(state.linkUrl);
    const scheduledStart = state.scheduleMode === 'SCHEDULED' ? trimToNull(state.startAt) : null;
    const scheduledEnd = state.scheduleMode === 'SCHEDULED' ? trimToNull(state.endAt) : null;

    if (mode === 'create') {
      const payload: CreatePromotionPayload = {
        title: state.title,
        bannerImageUrl: bannerImage,
        linkUrl: linkUrlValue,
        clubId,
        active: state.active,
        displayOrder: displayOrderValue,
        palette: state.palette,
        tag: trimToNull(state.tag),
        subtitle: trimToNull(state.subtitle),
        ctaLabel: trimToNull(state.ctaLabel),
        emoji: trimToNull(state.emoji),
        startAt: scheduledStart,
        endAt: scheduledEnd,
        renderMode: state.renderMode,
        imageAltText: trimToNull(state.imageAltText),
      };
      await props.onSubmit(payload);
    } else {
      const initialValues = props.initialValues;
      const hadClub = initialValues.club !== null;
      const nowCuration = state.isCuration;

      const payload: UpdatePromotionPayload = {
        title: state.title,
        active: state.active,
        displayOrder: displayOrderValue,
        palette: state.palette,
      };

      // 이미지 — null 로 비우는 경우 clearBannerImageUrl, 값 있는 경우 그대로 보낸다.
      if (bannerImage === null) {
        if (initialValues.bannerImageUrl !== null) payload.clearBannerImageUrl = true;
      } else {
        payload.bannerImageUrl = bannerImage;
      }

      // linkUrl — 이미지와 동일 패턴. 비웠으면 clearLinkUrl, 값 있으면 그대로.
      if (linkUrlValue === null) {
        if (initialValues.linkUrl !== null) payload.clearLinkUrl = true;
      } else {
        payload.linkUrl = linkUrlValue;
      }

      // 텍스트 필드들 — 동일 패턴.
      assignOrClear(payload, 'tag', 'clearTag', state.tag, initialValues.tag);
      assignOrClear(payload, 'subtitle', 'clearSubtitle', state.subtitle, initialValues.subtitle);
      assignOrClear(payload, 'ctaLabel', 'clearCtaLabel', state.ctaLabel, initialValues.ctaLabel);
      assignOrClear(payload, 'emoji', 'clearEmoji', state.emoji, initialValues.emoji);
      assignOrClear(payload, 'imageAltText', 'clearImageAltText', state.imageAltText, initialValues.imageAltText);

      // 기간 — SCHEDULED 면 값을 보내고, ALWAYS 면 원래 값이 있던 경우만 clear 플래그.
      if (scheduledStart === null) {
        if (initialValues.startAt !== null) payload.clearStartAt = true;
      } else {
        payload.startAt = scheduledStart;
      }
      if (scheduledEnd === null) {
        if (initialValues.endAt !== null) payload.clearEndAt = true;
      } else {
        payload.endAt = scheduledEnd;
      }

      // renderMode 는 항상 명시적으로 전송 — 백엔드는 null=변경 안 함이지만 폼 state 에는 항상 값이 있다.
      payload.renderMode = state.renderMode;

      if (hadClub && nowCuration) {
        payload.clearClubId = true;
      } else if (!nowCuration) {
        payload.clubId = clubId;
      }

      await props.onSubmit(payload);
    }
  };

  const previewStyle = PROMOTION_PALETTE[state.palette];
  const hasBannerImage = state.bannerImageUrl.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 배너 유형 (모드 선택) — 가장 먼저 결정해야 다른 필드 의미가 정해진다. */}
      <div className="space-y-2">
        <span className="block text-[12.5px] font-semibold text-charcoal-2">배너 유형</span>
        <div className="flex flex-col gap-2 text-[13.5px]">
          <label className="inline-flex items-start gap-2">
            <input
              type="radio"
              name="renderMode"
              checked={state.renderMode === 'SYSTEM_COMPOSED'}
              onChange={() => update('renderMode', 'SYSTEM_COMPOSED')}
              className="mt-1"
            />
            <div>
              <div className="font-semibold">시스템 조합형</div>
              <div className="text-charcoal-3 text-[12px]">제목/부제목/CTA/팔레트를 자동 조합해 렌더링합니다.</div>
            </div>
          </label>
          <label className="inline-flex items-start gap-2">
            <input
              type="radio"
              name="renderMode"
              checked={state.renderMode === 'FULL_BLEED_IMAGE'}
              onChange={() => update('renderMode', 'FULL_BLEED_IMAGE')}
              className="mt-1"
            />
            <div>
              <div className="font-semibold">완성 이미지형</div>
              <div className="text-charcoal-3 text-[12px]">업로드한 이미지를 가공 없이 그대로 노출합니다 (포스터/홍보물).</div>
            </div>
          </label>
        </div>
      </div>

      {/* FULL_BLEED 전환 가드 — 필수 필드가 비어 있을 때 인라인 경고 (저장은 백엔드 422 로 차단). */}
      {state.renderMode === 'FULL_BLEED_IMAGE' && state.bannerImageUrl.trim() === '' && (
        <p className="rounded-md bg-coral/10 border border-coral/40 px-3 py-2 text-[12.5px] text-coral">
          완성 이미지형으로 전환하려면 배너 이미지 업로드가 필요합니다.
        </p>
      )}
      {state.renderMode === 'FULL_BLEED_IMAGE' && state.imageAltText.trim() === '' && (
        <p className="rounded-md bg-coral/10 border border-coral/40 px-3 py-2 text-[12.5px] text-coral">
          완성 이미지형으로 전환하려면 Alt Text 입력이 필요합니다.
        </p>
      )}

      <Field label="제목 (≤120자)">
        <input
          type="text"
          maxLength={120}
          value={state.title}
          onChange={(event) => update('title', event.target.value)}
          required
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <Field label="태그 (선택, ≤60자) — 예: EVENT · 9.25 — 9.27">
        <input
          type="text"
          maxLength={60}
          value={state.tag}
          onChange={(event) => update('tag', event.target.value)}
          placeholder="EVENT · 9.25 — 9.27"
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <Field label="부제 (선택, ≤200자)">
        <input
          type="text"
          maxLength={200}
          value={state.subtitle}
          onChange={(event) => update('subtitle', event.target.value)}
          placeholder="67개 동아리 · 80개 부스 · 중앙광장"
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="CTA 라벨 (선택, ≤40자)">
          <input
            type="text"
            maxLength={40}
            value={state.ctaLabel}
            onChange={(event) => update('ctaLabel', event.target.value)}
            placeholder="박람회 자세히 보기"
            className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
          />
        </Field>
        <Field label="이모지 (선택, 1자 권장)">
          <input
            type="text"
            maxLength={8}
            value={state.emoji}
            onChange={(event) => update('emoji', event.target.value)}
            placeholder="🍂"
            className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
          />
        </Field>
      </div>

      <div>
        <span className="block text-[12.5px] font-semibold text-charcoal-2 mb-1.5">배너 이미지 (선택)</span>
        <ImageUploader
          value={state.bannerImageUrl}
          onChange={(url) => update('bannerImageUrl', url)}
          purpose="PROMOTION_BANNER"
          placeholder="배너 이미지를 업로드하세요"
          altText="배너 이미지"
        />
        <p className="mt-1 text-[12px] text-charcoal-3">
          {hasBannerImage
            ? '이미지가 등록되어 팔레트 선택은 생략됩니다.'
            : '이미지 없이 텍스트+팔레트만으로도 배너 등록이 가능합니다.'}
        </p>
        {imageSizeWarning && (
          <p className="mt-1 text-[12px] text-amber-600">
            {imageSizeWarning}
          </p>
        )}
      </div>

      {/* Alt Text — 완성 이미지형에서는 필수, 시스템 조합형에서는 보존만 (입력 UI 는 항상 유지). */}
      <Field label={`Alt Text ${state.renderMode === 'FULL_BLEED_IMAGE' ? '(필수)' : '(선택)'}`}>
        <input
          type="text"
          maxLength={200}
          value={state.imageAltText}
          onChange={(event) => update('imageAltText', event.target.value)}
          placeholder="2026 AI 학과 해커톤 참가자 모집"
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
        <p className="mt-1 text-[12px] text-charcoal-3">
          {state.renderMode === 'FULL_BLEED_IMAGE'
            ? '포스터에 표시된 핵심 텍스트(제목, 일정 등) 를 그대로 적어주세요. 스크린리더와 SEO 가 이 텍스트를 읽습니다.'
            : '완성 이미지형 배너로 전환할 때 접근성·SEO 용도로 사용됩니다. 지금 입력해두면 모드 전환 시 자동 적용됩니다.'}
        </p>
      </Field>

      {!hasBannerImage && (
        <div>
          <span className="block text-[12.5px] font-semibold text-charcoal-2 mb-1.5">팔레트 (필수)</span>
          <div className="grid grid-cols-3 gap-2">
            {PALETTE_OPTIONS.map((option) => {
              const style = PROMOTION_PALETTE[option.value];
              const selected = state.palette === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => update('palette', option.value)}
                  className={`relative h-14 rounded-md border-2 px-3 text-left text-[12px] font-semibold transition-colors ${selected ? 'border-ink' : 'border-line hover:border-charcoal-3'}`}
                  style={{ background: style.bg, color: style.fg }}
                >
                  {option.label}
                  {selected && (
                    <span className="absolute top-1 right-1.5 text-[10px] font-bold">✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Field label="링크 URL (선택, ≤2000자)">
        <input
          type="url"
          maxLength={2000}
          value={state.linkUrl}
          onChange={(event) => update('linkUrl', event.target.value)}
          placeholder="https://..."
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <div className="space-y-2">
        <span className="block text-[12.5px] font-semibold text-charcoal-2">동아리 연결</span>
        <label className="inline-flex items-center gap-2 text-[13.5px]">
          <input
            type="checkbox"
            checked={state.isCuration}
            onChange={(event) => update('isCuration', event.target.checked)}
          />
          큐레이션 배너 (동아리 미연결)
        </label>        {!state.isCuration && (
          <div className="mt-2">
            <label className="block text-[12.5px] font-semibold text-charcoal-2 mb-1.5">동아리 선택</label>
            <ClubSelector
              selectedClubId={state.clubId}
              selectedClubName={state.clubName}
              onSelect={(clubId, clubName) => {
                setState((prev) => ({ ...prev, clubId, clubName }));
              }}
              onClear={() => {
                setState((prev) => ({ ...prev, clubId: null, clubName: null }));
              }}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-6">
        <label className="inline-flex items-center gap-2 text-[13.5px]">
          <input
            type="checkbox"
            checked={state.active}
            onChange={(event) => update('active', event.target.checked)}
          />
          활성 (배너 노출)
        </label>
      </div>

      <div className="space-y-2">
        <span className="block text-[12.5px] font-semibold text-charcoal-2">노출 기간</span>
        <div className="flex items-center gap-5 text-[13.5px]">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="scheduleMode"
              checked={state.scheduleMode === 'ALWAYS'}
              onChange={() => update('scheduleMode', 'ALWAYS')}
            />
            상시 노출
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="scheduleMode"
              checked={state.scheduleMode === 'SCHEDULED'}
              onChange={() => update('scheduleMode', 'SCHEDULED')}
            />
            기간 노출
          </label>
        </div>
        {state.scheduleMode === 'SCHEDULED' && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <label className="block">
              <span className="block text-[12px] font-semibold text-charcoal-3 mb-1">시작</span>
              <input
                type="datetime-local"
                value={state.startAt}
                onChange={(event) => update('startAt', event.target.value)}
                className="w-full px-3 py-2 rounded-md border border-line bg-paper text-[13.5px]"
              />
            </label>
            <label className="block">
              <span className="block text-[12px] font-semibold text-charcoal-3 mb-1">종료</span>
              <input
                type="datetime-local"
                value={state.endAt}
                onChange={(event) => update('endAt', event.target.value)}
                className="w-full px-3 py-2 rounded-md border border-line bg-paper text-[13.5px]"
              />
            </label>
            <p className="col-span-2 text-[12px] text-charcoal-3">
              한쪽만 비워두면 그 방향은 상시(시작 미지정=즉시 / 종료 미지정=만료 없음) 처리됩니다.
            </p>
          </div>
        )}
      </div>

      <Field label="노출 순서 (숫자가 작을수록 앞에 표시)">
        <input
          type="number"
          min={0}
          value={state.displayOrder}
          onChange={(event) => update('displayOrder', event.target.value)}
          required
          className="w-32 px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      {/* 라이브 미리보기 */}
      <div>
        <span className="block text-[12.5px] font-semibold text-charcoal-2 mb-1.5">미리보기</span>
        <div
          className="relative flex h-[200px] flex-col justify-between overflow-hidden rounded-xl px-8 py-7"
          style={{
            background: previewStyle.bg,
            color: hasBannerImage ? '#fff' : previewStyle.fg,
          }}
        >
          {hasBannerImage && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- 사용자 업로드 스토리지 URL. 깨지면 팔레트 색만 노출되도록 onError 에서 숨김. */}
              <img
                src={state.bannerImageUrl}
                alt=""
                aria-hidden
                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ background: 'rgba(0,0,0,0.22)' }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 100%)' }}
              />
            </>
          )}
          {state.emoji && (
            <div
              className="pointer-events-none absolute -right-2 -top-3 text-[140px] leading-none opacity-[0.18]"
              style={{ transform: 'rotate(-12deg)' }}
            >
              {state.emoji}
            </div>
          )}
          {state.tag && (
            <div
              className="relative inline-flex items-center gap-2 self-start rounded-full px-3 py-[5px] text-[11.5px] font-extrabold"
              style={{
                background: hasBannerImage ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.14)',
                color: hasBannerImage ? '#143025' : previewStyle.accent,
              }}
            >
              {state.tag}
            </div>
          )}
          <div className="relative">
            <div className="text-[26px] font-bold leading-tight">{state.title || '제목 미리보기'}</div>
            {state.subtitle && (
              <div className="mt-1.5 text-[13px] opacity-85">{state.subtitle}</div>
            )}
            {state.ctaLabel && (
              <div
                className="mt-3 inline-block rounded-md px-3 py-1.5 text-[12px] font-bold"
                style={{
                  background: hasBannerImage ? '#9DB6A0' : previewStyle.accent,
                  color: hasBannerImage ? '#143025' : '#fff',
                }}
              >
                {state.ctaLabel} →
              </div>
            )}
          </div>
        </div>
      </div>

      {errorMessage && (
        <p className="rounded-md bg-coral/10 border border-coral/40 px-3 py-2 text-[13px] text-coral">
          {errorMessage}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-5 py-2.5 rounded-full bg-ink text-paper text-[13.5px] font-semibold disabled:opacity-50"
        >
          {isSubmitting ? '저장 중…' : mode === 'create' ? '배너 등록' : '수정 저장'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-semibold text-charcoal-2 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

/**
 * 텍스트 필드의 PATCH 페이로드 빌더 — 값이 비워졌고 원래 값이 있었다면 clear 플래그를,
 * 값이 있다면 그대로 보낸다. 값이 양쪽 모두 비어 있으면 아무것도 보내지 않는다.
 */
function assignOrClear<
  K extends 'tag' | 'subtitle' | 'ctaLabel' | 'emoji' | 'imageAltText',
  C extends 'clearTag' | 'clearSubtitle' | 'clearCtaLabel' | 'clearEmoji' | 'clearImageAltText',
>(
  payload: UpdatePromotionPayload,
  field: K,
  clearFlag: C,
  nextRaw: string,
  initial: string | null,
) {
  const next = nextRaw.trim();
  if (next.length === 0) {
    if (initial !== null) {
      (payload as Record<string, unknown>)[clearFlag] = true;
    }
    return;
  }
  (payload as Record<string, unknown>)[field] = next;
}
