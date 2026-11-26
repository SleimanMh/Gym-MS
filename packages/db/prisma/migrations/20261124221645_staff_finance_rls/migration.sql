-- Phase 3 (staff and finance): tenant isolation and integrity rules Prisma can't model.

SELECT app_tenant_table(t) FROM unnest(ARRAY[
  'employees', 'shifts', 'time_entries', 'expense_categories', 'expenses', 'budgets'
]) AS t;

SELECT app_same_tenant_fk(c, col, p) FROM (VALUES
  ('employees', 'home_location_id', 'locations'),
  ('shifts', 'employee_id', 'employees'),
  ('shifts', 'location_id', 'locations'),
  ('time_entries', 'employee_id', 'employees'),
  ('time_entries', 'location_id', 'locations'),
  ('expenses', 'category_id', 'expense_categories'),
  ('expenses', 'location_id', 'locations'),
  ('expenses', 'recurring_parent_id', 'expenses'),
  ('budgets', 'category_id', 'expense_categories')
) AS x(c, col, p);

-- Staff logins are global users; an employee may link to one.
ALTER TABLE employees
  ADD CONSTRAINT employees_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;

-- A person can only be clocked in once at a time.
CREATE UNIQUE INDEX time_entries_one_open_per_employee
  ON time_entries (employee_id) WHERE clock_out IS NULL;

ALTER TABLE employees ADD CONSTRAINT employees_pay_rate_nonnegative CHECK (pay_rate_minor >= 0);
ALTER TABLE employees ADD CONSTRAINT employees_commission_range CHECK (commission_bp BETWEEN 0 AND 10000);
ALTER TABLE shifts ADD CONSTRAINT shifts_ends_after_start CHECK (ends_at > starts_at);
ALTER TABLE time_entries ADD CONSTRAINT time_entries_out_after_in CHECK (clock_out IS NULL OR clock_out > clock_in);
ALTER TABLE expenses ADD CONSTRAINT expenses_amount_positive CHECK (amount_minor > 0);
ALTER TABLE budgets ADD CONSTRAINT budgets_amount_nonnegative CHECK (amount_minor >= 0);
ALTER TABLE budgets ADD CONSTRAINT budgets_first_of_month CHECK (extract(day FROM month) = 1);
