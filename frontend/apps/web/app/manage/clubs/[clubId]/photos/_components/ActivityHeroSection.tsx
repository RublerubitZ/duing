'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { ClubHeroActivity, ClubPhoto } from '@duing/types';
import {
  useCreatePhotoMutation,
  useFileUploadMutation,
  useReorderHeroActivitiesMutation,
  useUpdateHeroActivityMutation,
} from '@duing/hooks';
import { SectionCard } from '@/app/manage/_components/SectionCard';
import { HeroActivityCard } from './HeroActivityCard';
import { HeroActivityEditor } from './HeroActivityEditor';
import { PhotoPickerDialog } from './PhotoPickerDialog';

const SLOT_COUNT = 6;
const REORDER_DEBOUNCE_MS = 1000;

type Slot = { key: string; hero: ClubHeroActivity | null };
type PendingPhoto = { clubPhotoId: number; storageKey: string };

export type ActivityHeroSectionHandle = {
  /** 사진을 첫 빈(비-pending) 슬롯에 시드해 편집 폼을 연다("대표로 지정"). 없으면 no-op. */
  promotePhoto: (photo: ClubPhoto) => void;
};

type Props = {
  clubId: number;
  heroActivities: ClubHeroActivity[];
  photos: ClubPhoto[];
  /**
   * pending(시드됐지만 미저장) 사진 id 목록 통지 — 부모가 그리드 "대표로 지정" 선차단에 쓴다.
   * effect deps 에 포함되므로 안정 참조 필수 — 인라인 화살표를 넘기면 재렌더 루프가 된다(setState 직접 전달 권장).
   */
  onPendingPhotoIdsChange?: (clubPhotoIds: number[]) => void;
};

/** displayOrder 1..6 을 고정 슬롯 배열로 조립한다. 빈 슬롯은 null(순서 안 당김). */
function buildSlots(heroActivities: ClubHeroActivity[]): Slot[] {
  return reconcileSlots(heroActivities, []);
}

/**
 * refetch 재조립 — 서버 hero 는 displayOrder 위치에 놓고, 빈 위치는 직전 로컬 order 의
 * 같은 시각적 위치가 비어 있었으면 그 key 를 보존한다(=React key=dnd id=pendingByKey 키).
 * 드래그로 옮긴 pending draft 슬롯의 정체성을 유지하고, 그 위치가 서버 hero 로 채워지면(displaced)
 * key 가 사라져 I-8 pending 정리 effect 가 그 draft 를 걷어낸다. prevOrder 가 비면 buildSlots 와 동치.
 * jsdom dnd 한계로 순수 함수로 분리해 단위 테스트한다.
 */
export function reconcileSlots(heroActivities: ClubHeroActivity[], prevOrder: Slot[]): Slot[] {
  const heroByPosition = new Map<number, ClubHeroActivity>();
  for (const hero of heroActivities) heroByPosition.set(hero.displayOrder, hero);
  return Array.from({ length: SLOT_COUNT }, (_, index) => {
    const hero = heroByPosition.get(index + 1) ?? null;
    if (hero) return { key: `hero-${hero.id}`, hero };
    const prevSlot = prevOrder[index];
    if (prevSlot && prevSlot.hero === null) return { key: prevSlot.key, hero: null };
    return { key: `empty-${index + 1}`, hero: null };
  });
}

/**
 * 정렬 PUT 페이로드 계산 — 채워진 슬롯만 현재 배열 index+1 을 displayOrder 로 갖는다.
 * jsdom dnd 한계로 순수 함수로 분리해 단위 테스트한다.
 */
export function slotsToReorderPayload(
  slots: (ClubHeroActivity | null)[],
): { heroActivityId: number; displayOrder: number }[] {
  return slots.flatMap((hero, index) =>
    hero ? [{ heroActivityId: hero.id, displayOrder: index + 1 }] : [],
  );
}

type SortableSlotProps = {
  slot: Slot;
  slotNumber: number;
  clubId: number;
  pendingPhoto: PendingPhoto | null;
  onPickPhoto: () => void;
  onSaved: () => void;
  onBeforeSave: () => Promise<void>;
};

function SortableSlot({ slot, slotNumber, clubId, pendingPhoto, onPickPhoto, onSaved, onBeforeSave }: SortableSlotProps) {
  // 빈 슬롯은 드래그 불가(핸들 없음)·드롭 대상은 허용해 채워진 카드를 이동시킬 수 있게 한다.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slot.key,
    disabled: slot.hero === null ? { draggable: true } : false,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const dragHandle = slot.hero ? (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label="드래그하여 순서 변경"
      className="cursor-grab touch-none text-charcoal-3 active:cursor-grabbing"
    >
      <GripVertical size={16} />
    </button>
  ) : (
    <span aria-hidden className="inline-block w-4" />
  );

  return (
    <div ref={setNodeRef} style={style}>
      <HeroActivityEditor
        clubId={clubId}
        slotNumber={slotNumber}
        hero={slot.hero}
        pendingPhoto={pendingPhoto}
        dragHandle={dragHandle}
        onPickPhoto={onPickPhoto}
        onSaved={onSaved}
        onBeforeSave={onBeforeSave}
      />
    </div>
  );
}

/**
 * 대표 활동 6슬롯 섹션. 슬롯 조립·핸들 전용 dnd(DragOverlay)·사진 피커·승격 진입점을 소유한다.
 * 정렬은 1초 디바운스 PUT + 실패 롤백(PhotoGrid 관행 클론). 기존 hero 사진 교체는 여기서 즉시 PATCH.
 */
export const ActivityHeroSection = forwardRef<ActivityHeroSectionHandle, Props>(
  function ActivityHeroSection({ clubId, heroActivities, photos, onPendingPhotoIdsChange }, ref) {
    const [order, setOrder] = useState<Slot[]>(() => buildSlots(heroActivities));
    const [pendingByKey, setPendingByKey] = useState<Record<string, PendingPhoto>>({});
    const [pickingKey, setPickingKey] = useState<string | null>(null);
    const [replacingHeroId, setReplacingHeroId] = useState<number | null>(null);
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    // 피커 안(업로드/생성 서버 실패) 전용 에러 — 다이얼로그를 연 채 표시한다.
    const [pickerServerError, setPickerServerError] = useState<string | null>(null);

    const reorder = useReorderHeroActivitiesMutation(clubId);
    const updateHero = useUpdateHeroActivityMutation(clubId);
    const uploadFile = useFileUploadMutation();
    const createPhoto = useCreatePhotoMutation(clubId);

    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingReorder = useRef<Slot[] | null>(null);
    const inflightReorder = useRef<Promise<void> | null>(null);
    const lastCommitted = useRef<Slot[]>(order);
    // 직전 로컬 order 를 ref 로 노출 — 재동기화 effect 가 deps 없이 최신 순서를 reconcile 입력으로 읽는다
    // (order 를 deps 에 넣으면 드래그마다 effect 가 서버값으로 되돌려 조작을 끊는다).
    const orderRef = useRef(order);
    orderRef.current = order;

    // 서버 반영(정렬/생성/삭제 후 invalidate) 시 props 를 진리원본으로 로컬 순서 재동기화.
    useEffect(() => {
      const next = reconcileSlots(heroActivities, orderRef.current);
      setOrder(next);
      lastCommitted.current = next;
      // 서버 확인 후 pending 정리 — 현재 빈 슬롯 key 에 없는 pending(=해당 슬롯이 hero 로 채워짐)은 제거.
      // 저장 직후 빈 슬롯 플래시를 없애고(서버 도착 전까지 pending 유지), 슬롯 재생성 시 고아 pending 부활을 막는다.
      const emptyKeys = new Set(next.filter((slot) => slot.hero === null).map((slot) => slot.key));
      setPendingByKey((prev) => {
        const kept = Object.fromEntries(Object.entries(prev).filter(([key]) => emptyKeys.has(key)));
        return Object.keys(kept).length === Object.keys(prev).length ? prev : kept;
      });
    }, [heroActivities]);

    // pending 사진 id 변화를 부모에 통지(그리드 "대표로 지정" 선차단용).
    useEffect(() => {
      onPendingPhotoIdsChange?.(Object.values(pendingByKey).map((pending) => pending.clubPhotoId));
    }, [pendingByKey, onPendingPhotoIdsChange]);

    // 최신 runReorder 를 ref 로 보관 — unmount cleanup 이 deps 없이 호출하게(함수는 매 렌더 재생성).
    const runReorderRef = useRef<(next: Slot[]) => Promise<void>>(() => Promise.resolve());

    // unmount 시 대기 중 정렬이 있으면 타이머를 버리는 대신 즉시 발화(fire-and-forget) — RQ mutation 은 완주.
    // StrictMode 이중 마운트는 pendingReorder 가 null 이라 no-op.
    useEffect(() => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      const queued = pendingReorder.current;
      pendingReorder.current = null;
      if (queued) void runReorderRef.current(queued);
    }, []);

    const sensors = useSensors(
      useSensor(PointerSensor),
      useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const busy = uploadFile.isPending || createPhoto.isPending || updateHero.isPending;
    // 저장된 hero + pending(시드) 사진 모두 사용 중 — 피커에서 딤 처리(중복 선택 시 409 선차단).
    const usedPhotoIds = [
      ...heroActivities.map((item) => item.clubPhotoId),
      ...Object.values(pendingByKey).map((pending) => pending.clubPhotoId),
    ];

    function openPicker(slot: Slot) {
      // 대기 중 정렬을 먼저 확정 — 이후 create displayOrder 가 최신 서버 순서를 전제하도록.
      void flushReorder();
      setActionError(null);
      setPickerServerError(null);
      setPickingKey(slot.key);
      setReplacingHeroId(slot.hero ? slot.hero.id : null);
    }

    function closePicker() {
      setPickingKey(null);
      setReplacingHeroId(null);
      setPickerServerError(null);
    }

    async function handlePick(photo: ClubPhoto) {
      if (replacingHeroId !== null) {
        // 기존 hero 사진 교체는 부모가 즉시 PATCH — 에디터에 pendingPhoto 를 넘기지 않아 이중 PATCH 를 막는다.
        const heroActivityId = replacingHeroId;
        closePicker();
        try {
          await updateHero.mutateAsync({ heroActivityId, payload: { clubPhotoId: photo.id } });
        } catch (error) {
          setActionError(error instanceof Error ? error.message : '사진 교체에 실패했습니다.');
        }
        return;
      }
      if (pickingKey) {
        const key = pickingKey;
        setPendingByKey((prev) => ({ ...prev, [key]: { clubPhotoId: photo.id, storageKey: photo.storageKey } }));
        closePicker();
      }
    }

    async function handleUploadNew(file: File) {
      // 재시도 시 이전 실패 메시지 클리어. 실패는 다이얼로그를 연 채 피커 안에 표시한다.
      setPickerServerError(null);
      try {
        const uploaded = await uploadFile.mutateAsync({ file, purpose: 'PHOTO' });
        const created = await createPhoto.mutateAsync({
          storageKey: uploaded.storageKey,
          caption: null,
          width: null,
          height: null,
        });
        await handlePick(created);
      } catch (error) {
        setPickerServerError(error instanceof Error ? error.message : '사진 업로드에 실패했습니다.');
      }
    }

    // 저장 성공 시 pending 은 즉시 지우지 않는다(서버 반영 effect 가 정리 — 빈 슬롯 플래시 방지).
    // 여기서는 남아 있던 섹션 에러만 걷어낸다.
    function handleSaved() {
      setActionError(null);
    }

    function handleDragStart(event: DragStartEvent) {
      // 다음 드래그 시작 시 직전 정렬 실패 안내를 걷어낸다(성공 시엔 runReorder 가 클리어).
      setActionError(null);
      setActiveKey(String(event.active.id));
    }

    function handleDragEnd(event: DragEndEvent) {
      setActiveKey(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = order.findIndex((slot) => slot.key === active.id);
      const newIndex = order.findIndex((slot) => slot.key === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const next = arrayMove(order, oldIndex, newIndex);
      setOrder(next);
      scheduleReorder(next);
    }

    function scheduleReorder(next: Slot[]) {
      pendingReorder.current = next;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        debounceTimer.current = null;
        const queued = pendingReorder.current;
        pendingReorder.current = null;
        if (queued) void runReorder(queued);
      }, REORDER_DEBOUNCE_MS);
    }

    // PUT 실행 본체 — 진행 중 promise 를 ref 에 보관해 flushReorder 가 완료를 대기할 수 있게 한다.
    function runReorder(next: Slot[]) {
      let request: Promise<void> | null = null;
      request = (async () => {
        try {
          await reorder.mutateAsync({ items: slotsToReorderPayload(next.map((slot) => slot.hero)) });
          lastCommitted.current = next;
          setActionError(null);
        } catch {
          setOrder(lastCommitted.current);
          // 실패는 alert 대신 섹션 인라인 에러로(이 화면의 확립된 통지 채널) — 다음 드래그 시작 시 클리어.
          setActionError('순서 저장에 실패했습니다. 다시 시도해주세요.');
        } finally {
          if (inflightReorder.current === request) inflightReorder.current = null;
        }
      })();
      inflightReorder.current = request;
      return request;
    }
    runReorderRef.current = runReorder;

    // 대기 중 정렬을 즉시 확정하고 완료까지 await 한다 — create/update·피커 열기 직전 순서 확정용.
    // 타이머 대기 중이면 취소 후 즉시 PUT, 이미 자연 발화해 PUT 이 in-flight 면 그 완료를 대기(추월 방지).
    async function flushReorder() {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
        const queued = pendingReorder.current;
        pendingReorder.current = null;
        if (queued) await runReorder(queued);
        return;
      }
      if (inflightReorder.current) await inflightReorder.current;
    }

    useImperativeHandle(
      ref,
      () => ({
        promotePhoto: (photo: ClubPhoto) => {
          // 이미 pending 이 시드된 슬롯은 건너뛴다 — 편집 중 draft 를 무경고로 덮어쓰지 않게(전부 pending 이면 no-op).
          const emptySlot = order.find((slot) => slot.hero === null && !(slot.key in pendingByKey));
          if (!emptySlot) return;
          setPendingByKey((prev) => ({
            ...prev,
            [emptySlot.key]: { clubPhotoId: photo.id, storageKey: photo.storageKey },
          }));
        },
      }),
      [order, pendingByKey],
    );

    const activeIndex = activeKey ? order.findIndex((slot) => slot.key === activeKey) : -1;
    const activeHero = activeIndex >= 0 ? (order[activeIndex]?.hero ?? null) : null;

    return (
      <SectionCard
        number={1}
        title="대표 활동 6"
        description="사진 + 제목 + 한줄 설명의 통일 양식으로 정리한 대표 활동이에요. 홈·동아리 소개 상단에 강조 노출됩니다. 가능하면 6개를 모두 등록하세요."
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[12.5px] font-semibold text-charcoal-2">등록 {heroActivities.length}/6</span>
        </div>
        {actionError && <p className="mb-2 text-[12px] text-coral">{actionError}</p>}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveKey(null)}
        >
          <SortableContext items={order.map((slot) => slot.key)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {order.map((slot, index) => (
                <SortableSlot
                  key={slot.key}
                  slot={slot}
                  slotNumber={index + 1}
                  clubId={clubId}
                  pendingPhoto={pendingByKey[slot.key] ?? null}
                  onPickPhoto={() => openPicker(slot)}
                  onSaved={handleSaved}
                  onBeforeSave={flushReorder}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeHero && (
              <HeroActivityCard
                slotNumber={activeIndex + 1}
                imageUrl={activeHero.storageKey}
                title={activeHero.title}
                description={activeHero.description}
              />
            )}
          </DragOverlay>
        </DndContext>

        <PhotoPickerDialog
          open={pickingKey !== null}
          photos={photos}
          usedPhotoIds={usedPhotoIds}
          busy={busy}
          serverError={pickerServerError}
          onPick={handlePick}
          onUploadNew={handleUploadNew}
          onClose={closePicker}
        />
      </SectionCard>
    );
  },
);
