import { Suspense } from 'react';
import { FacilityBookingPage } from './_pages/FacilityBookingPage';
import { BookingHomeSkeleton } from './_components/booking/BookingHomeSkeleton';

export default function FacilitiesPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-layout px-4 pb-16 pt-8 sm:px-6 md:px-10">
          <BookingHomeSkeleton />
        </main>
      }
    >
      <FacilityBookingPage />
    </Suspense>
  );
}
