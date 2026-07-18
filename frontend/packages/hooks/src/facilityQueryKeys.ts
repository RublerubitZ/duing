import type { BookingStatus } from '@duing/types';

export const facilityQueryKeys = {
  all: ['facilities'] as const,
  usage: (yearMonth?: string) =>
    [...facilityQueryKeys.all, 'usage', yearMonth ?? 'current'] as const,
  detail: (facilityId: number, yearMonth?: string) =>
    [...facilityQueryKeys.all, facilityId, yearMonth ?? 'current'] as const,
  availabilityAll: () => [...facilityQueryKeys.all, 'availability'] as const,
  availability: (facilityId: number, yearMonth?: string) =>
    [...facilityQueryKeys.availabilityAll(), facilityId, yearMonth ?? 'current'] as const,
  purposePresets: () => [...facilityQueryKeys.all, 'purpose-presets'] as const,
  bookingWindow: () => [...facilityQueryKeys.all, 'booking-window'] as const,
  clubBookingsAll: (clubId: number) =>
    [...facilityQueryKeys.all, 'club-bookings', clubId] as const,
  clubBookings: (clubId: number, status?: BookingStatus) =>
    [...facilityQueryKeys.clubBookingsAll(clubId), status ?? 'all'] as const,
  clubBookingDetail: (clubId: number, bookingId: number) =>
    [...facilityQueryKeys.clubBookingsAll(clubId), 'detail', bookingId] as const,
};
