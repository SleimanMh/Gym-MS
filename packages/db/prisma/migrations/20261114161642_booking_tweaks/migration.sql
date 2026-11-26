-- Bookings promoted from the waitlist get their own source.
ALTER TYPE "BookingSource" ADD VALUE IF NOT EXISTS 'waitlist';

-- A no-show also occupies the member's one booking for that class (no re-booking after a no-show).
DROP INDEX IF EXISTS bookings_one_active_per_member;
CREATE UNIQUE INDEX bookings_one_active_per_member
  ON bookings (session_id, member_id) WHERE status IN ('booked', 'attended', 'no_show');
