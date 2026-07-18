export function CalendarGridSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="캘린더 불러오는 중" className="animate-pulse motion-reduce:animate-none rounded-lg border border-line bg-paper p-5">
      <div className="mx-auto mb-4 h-6 w-32 rounded-full bg-graysoft" />
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 42 }).map((_, index) => (
          <div key={index} className="h-14 rounded-md bg-graysoft/60" />
        ))}
      </div>
    </div>
  );
}

export function BookingHomeSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="예약 캘린더 불러오는 중" className="animate-pulse motion-reduce:animate-none space-y-4">
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-9 w-28 rounded-full bg-graysoft" />
        ))}
      </div>
      <CalendarGridSkeleton />
    </div>
  );
}
