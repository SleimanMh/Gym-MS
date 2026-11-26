-- FK to tenants + RLS policy (helpers defined in 20261114161641_phase1_rls).
SELECT app_tenant_table('user_permission_overrides');

-- Users are a platform table (no tenant): a plain FK is right here.
ALTER TABLE user_permission_overrides
  ADD CONSTRAINT user_permission_overrides_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE shifts ADD CONSTRAINT shifts_activity_length CHECK (activity IS NULL OR char_length(activity) BETWEEN 1 AND 60);
