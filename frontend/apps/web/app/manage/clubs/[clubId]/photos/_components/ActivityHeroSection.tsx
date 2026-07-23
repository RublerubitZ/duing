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
  /** 사진을 첫 빈 슬롯에 시드해 편집 폼을 연다("대표로 지정"). 빈 슬롯 없으면 no-op. */
  promotePhoto: (photo: ClubPhoto) => void;
  hasEmptySlot: boolean;
};

type Props = {
  clubId: number;
  heroActivities: ClubHeroActivity[];
  photos: ClubPhoto[];
};

/** displayOrder 1..6 을 고정 슬롯 배열로 조립한다. 빈 슬롯은 null(순서 안 당김). */
function buildSlots(heroActivities: ClubHeroActivity[]): Slot[] {
  return Array.from({ length: SLOT_COUNT }, (_, index) => {
    const hero = heroActivities.find((item) => item.displayOrder === index + 1) ?? null;
    return { key: hero ? `hero-${hero.id}` : `empty-${index + 1}`, hero };
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
};

function SortableSlot({ slot, slotNumber, clubId, pendingPhoto, onPickPhoto, onSaved }: SortableSlotProps) {
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
      />
    </div>
  );
}

/**
 * 대표 활동 6슬롯 섹션. 슬롯 조립·핸들 전용 dnd(DragOverlay)·사진 피커·승격 진입점을 소유한다.
 * 정렬은 1초 디바운스 PUT + 실패 롤백(PhotoGrid 관행 클론). 기존 hero 사진 교체는 여기서 즉시 PATCH.
 */
export const ActivityHeroSection = forwardRef<ActivityHeroSectionHandle, Props>(
  function ActivityHeroSection({ clubId, heroActivities, photos }, ref) {
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
    const lastCommitted = useRef<Slot[]>(order);

    // 서버 반영(정렬/생성/삭제 후 invalidate) 시 props 를 진리원본으로 로컬 순서 재동기화.
    useEffect(() => {
      const next = buildSlots(heroActivities);
      setOrder(next);
      lastCommitted.current = next;
    }, [heroActivities]);

    useEffect(() => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    }, []);

    const sensors = useSensors(
      useSensor(PointerSensor),
      useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const busy = uploadFile.isPending || createPhoto.isPending || updateHero.isPending;
    const usedPhotoIds = heroActivities.map((item) => item.clubPhotoId);

    function openPicker(slot: Slot) {
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

    function handleSaved(key: string) {
      setPendingByKey((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }

    function handleDragStart(event: DragStartEvent) {
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
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(async () => {
        try {
          await reorder.mutateAsync({ items: slotsToReorderPayload(next.map((slot) => slot.hero)) });
          lastCommitted.current = next;
        } catch {
          setOrder(lastCommitted.current);
          alert('순서 저장에 실패했습니다. 다시 시도해주세요.');
        }
      }, REORDER_DEBOUNCE_MS);
    }

    useImperativeHandle(
      ref,
      () => ({
        promotePhoto: (photo: ClubPhoto) => {
          const emptySlot = order.find((slot) => slot.hero === null);
          if (!emptySlot) return;
          setPendingByKey((prev) => ({
            ...prev,
            [emptySlot.key]: { clubPhotoId: photo.id, storageKey: photo.storageKey },
          }));
        },
        hasEmptySlot: heroActivities.length < SLOT_COUNT,
      }),
      [order, heroActivities.length],
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
                  onSaved={() => handleSaved(slot.key)}
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
