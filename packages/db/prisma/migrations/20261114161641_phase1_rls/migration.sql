-- Phase 1 tenant isolation and integrity rules that Prisma can't model (see ADR 0002).

-- FK to tenants + RLS policy, in one call. Use this for every new tenant-owned table.
CREATE OR REPLACE FUNCTION app_tenant_table(p_table text) RETURNS void
  LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM app_enable_tenant_rls(p_table);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = p_table || '_tenant_id_fkey') THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE',
      p_table, p_table || '_tenant_id_fkey');
  END IF;
END $$;

-- Child.(tenant_id, col) must reference a parent row of the SAME tenant (FK checks bypass RLS).
CREATE OR REPLACE FUNCTION app_same_tenant_fk(p_child text, p_col text, p_parent text) RETURNS void
  LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = p_parent || '_tenant_id_id_key') THEN
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I UNIQUE (tenant_id, id)', p_parent, p_parent || '_tenant_id_id_key');
  END IF;
  EXECUTE format(
    'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id, %I) REFERENCES %I (tenant_id, id)',
    p_child, left(p_child || '_' || p_col || '_same_tenant_fkey', 63), p_col, p_parent);
END $$;

REVOKE ALL ON FUNCTION app_tenant_table(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_same_tenant_fk(text, text, text) FROM PUBLIC;

SELECT app_tenant_table(t) FROM unnest(ARRAY[
  'class_types', 'schedules', 'sessions', 'holidays',
  'members', 'membership_plans', 'member_subscriptions', 'subscription_freezes', 'credit_ledger',
  'bookings', 'waitlist_entries', 'check_ins',
  'payments', 'tenant_counters', 'leads', 'member_login_codes', 'outbox_events'
]) AS t;

SELECT app_same_tenant_fk(c, col, p) FROM (VALUES
  ('schedules', 'location_id', 'locations'),
  ('schedules', 'class_type_id', 'class_types'),
  ('schedules', 'room_id', 'rooms'),
  ('sessions', 'location_id', 'locations'),
  ('sessions', 'class_type_id', 'class_types'),
  ('sessions', 'room_id', 'rooms'),
  ('sessions', 'schedule_id', 'schedules'),
  ('holidays', 'location_id', 'locations'),
  ('members', 'home_location_id', 'locations'),
  ('member_subscriptions', 'member_id', 'members'),
  ('member_subscriptions', 'plan_id', 'membership_plans'),
  ('subscription_freezes', 'subscription_id', 'member_subscriptions'),
  ('credit_ledger', 'member_id', 'members'),
  ('credit_ledger', 'subscription_id', 'member_subscriptions'),
  ('bookings', 'session_id', 'sessions'),
  ('bookings', 'member_id', 'members'),
  ('bookings', 'subscription_id', 'member_subscriptions'),
  ('credit_ledger', 'booking_id', 'bookings'),
  ('waitlist_entries', 'session_id', 'sessions'),
  ('waitlist_entries', 'member_id', 'members'),
  ('waitlist_entries', 'promoted_booking_id', 'bookings'),
  ('check_ins', 'member_id', 'members'),
  ('check_ins', 'location_id', 'locations'),
  ('check_ins', 'booking_id', 'bookings'),
  ('payments', 'member_id', 'members'),
  ('payments', 'subscription_id', 'member_subscriptions'),
  ('leads', 'location_id', 'locations'),
  ('member_login_codes', 'member_id', 'members')
) AS x(c, col, p);

-- One active booking per member per class; one waiting entry per member per class.
CREATE UNIQUE INDEX bookings_one_active_per_member
  ON bookings (session_id, member_id) WHERE status IN ('booked', 'attended');
CREATE UNIQUE INDEX waitlist_one_waiting_per_member
  ON waitlist_entries (session_id, member_id) WHERE status = 'waiting';

-- Sanity checks.
ALTER TABLE sessions ADD CONSTRAINT sessions_capacity_positive CHECK (capacity > 0);
ALTER TABLE sessions ADD CONSTRAINT sessions_booked_count_nonnegative CHECK (booked_count >= 0);
ALTER TABLE sessions ADD CONSTRAINT sessions_ends_after_start CHECK (ends_at > starts_at);
ALTER TABLE schedules ADD CONSTRAINT schedules_weekday_range CHECK (weekday BETWEEN 0 AND 6);
ALTER TABLE schedules ADD CONSTRAINT schedules_start_minute_range CHECK (start_minute BETWEEN 0 AND 1439);
ALTER TABLE schedules ADD CONSTRAINT schedules_capacity_positive CHECK (capacity > 0);
ALTER TABLE membership_plans ADD CONSTRAINT membership_plans_price_nonnegative CHECK (price_minor >= 0);
ALTER TABLE payments ADD CONSTRAINT payments_amount_positive CHECK (amount_minor > 0);
ALTER TABLE subscription_freezes ADD CONSTRAINT freezes_valid_range CHECK (ends_on >= starts_on);

-- The credit ledger is append-only for the app.
REVOKE UPDATE, DELETE ON TABLE credit_ledger FROM gym_app;

-- Next value of a per-tenant counter (receipt numbers). Runs as the caller, so RLS applies.
CREATE OR REPLACE FUNCTION app_next_counter(p_key text) RETURNS integer
  LANGUAGE sql VOLATILE
AS $$
  INSERT INTO tenant_counters (tenant_id, key, value)
  VALUES (app_current_tenant_id(), p_key, 1)
  ON CONFLICT (tenant_id, key) DO UPDATE SET value = tenant_counters.value + 1
  RETURNING value
$$;
GRANT EXECUTE ON FUNCTION app_next_counter(text) TO gym_app;

-- The worker claims pending outbox events across tenants, then handles each one inside
-- withTenant(event.tenant_id). Claims expire after 2 minutes so a crashed worker can't strand events.
CREATE OR REPLACE FUNCTION app_claim_outbox(p_limit integer)
  RETURNS TABLE (id uuid, tenant_id uuid)
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  UPDATE outbox_events o
  SET locked_until = now() + interval '2 minutes', attempts = o.attempts + 1
  WHERE o.id IN (
    SELECT e.id FROM outbox_events e
    WHERE e.processed_at IS NULL
      AND e.attempts < 8
      AND (e.locked_until IS NULL OR e.locked_until < now())
    ORDER BY e.created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING o.id, o.tenant_id
$$;
REVOKE ALL ON FUNCTION app_claim_outbox(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_claim_outbox(integer) TO gym_app;
