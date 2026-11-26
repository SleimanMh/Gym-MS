# KPI definitions

Agreed once, used everywhere (PLAN.md section 8). Dashboards, rollups and exports must match these.

| Metric | Definition |
|---|---|
| MRR | Sum of active recurring memberships normalised to one month (annual ÷ 12). Excludes packs and drop-ins. |
| Churn rate | Members whose membership ended in the period ÷ active members at period start. |
| Retention | 1 − churn rate for the same period. |
| Fill rate | Booked (or attended — say which) ÷ capacity, per session; averages weight by capacity. |
| No-show rate | Bookings with status `no_show` ÷ bookings that were not cancelled. |
| Trial conversion | Trials that became paid members within 30 days ÷ trials started in the period. |
| Net profit | Revenue − (expenses + staff costs) for the period. |
| Profit margin | Net profit ÷ revenue. |
| Average revenue per member | Revenue in the period ÷ average active members in the period. |
| Profit per location | Revenue, expenses and staff pay assigned to a location (ADR 0005), minus nothing else; "after shared costs" also subtracts the location's revenue-weighted share of the gym-wide result. |
| Class fill (staff ranking) | Spots booked ÷ spots offered across the person's past classes in the month. |
| No-show share (staff ranking) | `no_show` ÷ (`attended` + `no_show`) for the person's past classes — people still `booked` (not marked) are left out. |
| Memberships sold | Memberships the person sold that received a payment in the period (count and amount). |
| Pay per check-in | The person's pay for the month ÷ check-ins (`attended`) in their classes. |

Rules
- All money in integer minor units with a currency code; convert only for display.
- Periods are computed in the location's time zone, stored in UTC.
- "Active member" = has a membership with status active on the day.
