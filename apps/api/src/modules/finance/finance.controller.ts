import { Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { Prisma } from "@gym/db";
import {
  addMonths,
  budgetSchema,
  expenseCategorySchema,
  expenseSchema,
  localDate,
  monthStr,
  profit,
  SHARED_LOCATION,
  splitMinor,
  toDateColumn,
  zonedToUtc,
  type BudgetInput,
  type ExpenseInput,
} from "@gym/shared";
import { RequiresFeature, RequiresPermission } from "../../common/decorators";
import { requirePrincipal, requireTenant } from "../../common/request-context";
import { ZodPipe } from "../../common/zod.pipe";
import { TenantDb } from "../../infra/tenant-db.service";
import { AuditService } from "../audit/audit.service";
import { staffStats } from "../staff/staff-stats";

const STREAMS = { recurring: "memberships", fixed_term: "memberships", trial: "memberships", class_pack: "packs", drop_in: "packs" } as const;

/** Expenses, budgets and the P&L (PLAN.md sections 6.7 and 8; docs/metrics.md). */
@Controller("v1")
@RequiresFeature("finance.pnl")
export class FinanceController {
  constructor(
    private readonly db: TenantDb,
    private readonly audit: AuditService,
  ) {}

  /**
   * P&L for the last `months` months (default 12), plus this month's detail: costs by category,
   * budget vs actual, revenue by stream. Staff costs come from the same pay rules as payroll.
   */
  @Get("finance/overview")
  @RequiresPermission("finance.view")
  overview(@Query(new ZodPipe(z.object({ months: z.coerce.number().int().min(3).max(24).default(12) }))) q: { months: number }) {
    const t = requireTenant();
    const tz = t.timezone;
    const thisMonth = `${localDate(new Date(), tz).slice(0, 7)}-01`;
    const months = Array.from({ length: q.months }, (_, i) => addMonths(thisMonth, i - q.months + 1));
    const at = (d: string) => zonedToUtc(d, 0, tz);

    return this.db.run(
      async (tx) => {
        const start = at(months[0]!);
        const [revRows, expRows, categories, budgets, streamRows] = await Promise.all([
          tx.$queryRaw<{ month: string; total: bigint }[]>`
            SELECT to_char(date_trunc('month', paid_at AT TIME ZONE ${tz}), 'YYYY-MM') AS month, COALESCE(SUM(amount_minor), 0)::bigint AS total
            FROM payments WHERE status = 'succeeded' AND currency = ${t.currency} AND paid_at >= ${start}
            GROUP BY 1`,
          tx.$queryRaw<{ month: string; category_id: string; total: bigint }[]>`
            SELECT to_char(spent_on, 'YYYY-MM') AS month, category_id, COALESCE(SUM(amount_minor), 0)::bigint AS total
            FROM expenses WHERE deleted_at IS NULL AND currency = ${t.currency} AND spent_on >= ${toDateColumn(months[0]!)}
            GROUP BY 1, 2`,
          tx.expenseCategory.findMany({ orderBy: { name: "asc" } }),
          tx.budget.findMany({ where: { month: toDateColumn(thisMonth) } }),
          tx.$queryRaw<{ type: string | null; total: bigint }[]>`
            SELECT mp.type::text AS type, COALESCE(SUM(p.amount_minor), 0)::bigint AS total
            FROM payments p
            LEFT JOIN member_subscriptions s ON s.id = p.subscription_id
            LEFT JOIN membership_plans mp ON mp.id = s.plan_id
            WHERE p.status = 'succeeded' AND p.currency = ${t.currency} AND p.paid_at >= ${at(thisMonth)}
            GROUP BY 1`,
        ]);

        // Staff costs per month (pay rules applied to each month's hours, classes and sales).
        const staffByMonth = new Map<string, bigint>();
        for (const m of months) {
          const stats = await staffStats(tx, at(m), at(addMonths(m, 1)));
          staffByMonth.set(m.slice(0, 7), [...stats.values()].reduce((s, x) => s + x.pay.totalMinor, 0n));
        }

        const revByMonth = new Map(revRows.map((r) => [r.month, r.total]));
        const expByMonth = new Map<string, bigint>();
        for (const r of expRows) expByMonth.set(r.month, (expByMonth.get(r.month) ?? 0n) + r.total);

        const series = months.map((m) => {
          const key = m.slice(0, 7);
          const line = { revenueMinor: revByMonth.get(key) ?? 0n, expensesMinor: expByMonth.get(key) ?? 0n, staffMinor: staffByMonth.get(key) ?? 0n };
          return { month: key, ...line, ...profit(line) };
        });
        const cur = series[series.length - 1]!;
        const prev = series[series.length - 2];
        // % change vs last month; meaningless against zero or a loss (e.g. net −$372 → +$879), so null.
        const change = (a: bigint, b: bigint | undefined) => (b === undefined || b <= 0n ? null : Math.round(((Number(a) - Number(b)) / Number(b)) * 1000) / 10);

        const curKey = thisMonth.slice(0, 7);
        const spentByCat = new Map(expRows.filter((r) => r.month === curKey).map((r) => [r.category_id, r.total]));
        const budgetByCat = new Map(budgets.map((b) => [b.categoryId, b.amountMinor]));

        const streams = { memberships: 0n, packs: 0n, other: 0n };
        for (const r of streamRows) {
          const k = r.type ? STREAMS[r.type as keyof typeof STREAMS] : "other";
          streams[k ?? "other"] += r.total;
        }

        return {
          currency: t.currency,
          month: curKey,
          kpis: {
            revenue: { valueMinor: cur.revenueMinor, changePct: change(cur.revenueMinor, prev?.revenueMinor) },
            costs: { valueMinor: cur.expensesMinor + cur.staffMinor, changePct: change(cur.expensesMinor + cur.staffMinor, prev ? prev.expensesMinor + prev.staffMinor : undefined) },
            net: { valueMinor: cur.netMinor, changePct: change(cur.netMinor, prev?.netMinor) },
            margin: { valuePct: cur.marginPct },
          },
          series,
          costsByCategory: [
            { key: "staff", name: null as string | null, amountMinor: cur.staffMinor, budgetMinor: null as bigint | null },
            ...categories
              .map((c) => ({ key: c.key ?? c.id, id: c.id, name: c.name, amountMinor: spentByCat.get(c.id) ?? 0n, budgetMinor: budgetByCat.get(c.id) ?? null }))
              .filter((c) => c.amountMinor > 0n || c.budgetMinor !== null),
          ].sort((a, b) => Number(b.amountMinor - a.amountMinor)),
          revenueByStream: streams,
          categories: categories.map((c) => ({ id: c.id, key: c.key, name: c.name })),
        };
      },
      // 12 months of staff stats is a few dozen small queries.
    );
  }

  /**
   * Profit per location for one month, plus the last 6 months' net per location.
   * Attribution (docs/metrics.md): revenue → the paying member's home location; expenses → their
   * location; staff pay → allocatePay (hours where clocked, classes where run, salary and commission
   * at home). Unassigned amounts are "shared"; `netAllocatedMinor` also spreads shared costs over
   * locations by their share of revenue, so the locations add up to the gym's total.
   */
  @Get("finance/locations")
  @RequiresPermission("finance.view")
  locations(@Query(new ZodPipe(z.object({ month: monthStr.optional() }))) q: { month?: string }) {
    const t = requireTenant();
    const tz = t.timezone;
    const month = `${q.month ?? localDate(new Date(), tz).slice(0, 7)}-01`;
    const at = (d: string) => zonedToUtc(d, 0, tz);
    const trendMonths = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5));

    return this.db.run(async (tx) => {
      const locs = await tx.location.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });

      const monthLines = async (m: string) => {
        const from = at(m);
        const to = at(addMonths(m, 1));
        const [rev, exp, staff] = await Promise.all([
          tx.$queryRaw<{ location_id: string | null; total: bigint }[]>`
            SELECT mb.home_location_id AS location_id, COALESCE(SUM(p.amount_minor), 0)::bigint AS total
            FROM payments p JOIN members mb ON mb.id = p.member_id
            WHERE p.status = 'succeeded' AND p.currency = ${t.currency} AND p.paid_at >= ${from} AND p.paid_at < ${to}
            GROUP BY 1`,
          tx.$queryRaw<{ location_id: string | null; total: bigint }[]>`
            SELECT location_id, COALESCE(SUM(amount_minor), 0)::bigint AS total
            FROM expenses
            WHERE deleted_at IS NULL AND currency = ${t.currency} AND spent_on >= ${toDateColumn(m)} AND spent_on < ${toDateColumn(addMonths(m, 1))}
            GROUP BY 1`,
          staffStats(tx, from, to),
        ]);
        const known = new Set(locs.map((l) => l.id));
        const key = (id: string | null) => (id && known.has(id) ? id : SHARED_LOCATION);
        const lines = new Map<string, { revenueMinor: bigint; expensesMinor: bigint; staffMinor: bigint }>();
        const line = (k: string) => {
          if (!lines.has(k)) lines.set(k, { revenueMinor: 0n, expensesMinor: 0n, staffMinor: 0n });
          return lines.get(k)!;
        };
        for (const l of [...locs.map((x) => x.id), SHARED_LOCATION]) line(l);
        for (const r of rev) line(key(r.location_id)).revenueMinor += r.total;
        for (const r of exp) line(key(r.location_id)).expensesMinor += r.total;
        for (const s of staff.values()) for (const [k, v] of Object.entries(s.payByLocation)) line(key(k)).staffMinor += v;
        return lines;
      };

      const allMonths = await Promise.all(trendMonths.map(monthLines));
      const cur = allMonths[allMonths.length - 1]!;
      const shared = cur.get(SHARED_LOCATION)!;
      const sharedCosts = shared.expensesMinor + shared.staffMinor - shared.revenueMinor;
      // Spread the gym-wide result (a cost, or income from members with no home location) by revenue share.
      const share = splitMinor(sharedCosts, Object.fromEntries(locs.map((l) => [l.id, Number(cur.get(l.id)!.revenueMinor)])));

      const rows = locs.map((l) => {
        const v = cur.get(l.id)!;
        const p = profit(v);
        const allocated = share[l.id] ?? 0n;
        return {
          id: l.id,
          name: l.name,
          ...v,
          ...p,
          sharedCostMinor: allocated,
          netAllocatedMinor: p.netMinor - allocated,
          trend: trendMonths.map((m, i) => ({ month: m.slice(0, 7), netMinor: profit(allMonths[i]!.get(l.id)!).netMinor })),
        };
      });
      const total = [...cur.values()].reduce(
        (s, v) => ({ revenueMinor: s.revenueMinor + v.revenueMinor, expensesMinor: s.expensesMinor + v.expensesMinor, staffMinor: s.staffMinor + v.staffMinor }),
        { revenueMinor: 0n, expensesMinor: 0n, staffMinor: 0n },
      );
      return {
        currency: t.currency,
        month: month.slice(0, 7),
        locations: rows,
        // Left over only when no location had revenue to spread it by.
        shared: { ...shared, unallocatedMinor: share[SHARED_LOCATION] ?? 0n },
        total: { ...total, ...profit(total) },
      };
    });
  }

  // ── Expenses ──

  @Get("expenses")
  @RequiresPermission("finance.view")
  expenses(@Query(new ZodPipe(z.object({ month: monthStr.optional() }))) q: { month?: string }) {
    const t = requireTenant();
    const first = `${q.month ?? localDate(new Date(), t.timezone).slice(0, 7)}-01`;
    return this.db.run((tx) =>
      tx.expense.findMany({
        where: { deletedAt: null, spentOn: { gte: toDateColumn(first), lt: toDateColumn(addMonths(first, 1)) } },
        include: { category: { select: { id: true, name: true, key: true } } },
        orderBy: [{ spentOn: "desc" }, { createdAt: "desc" }],
      }),
    );
  }

  @Post("expenses")
  @RequiresPermission("finance.manage")
  addExpense(@Body(new ZodPipe(expenseSchema)) body: ExpenseInput) {
    const t = requireTenant();
    return this.db.run(async (tx) => {
      const cat = await tx.expenseCategory.findFirst({ where: { id: body.categoryId } });
      if (!cat) throw new NotFoundException({ code: "CATEGORY_NOT_FOUND" });
      const e = await tx.expense.create({
        data: {
          tenantId: t.id,
          categoryId: cat.id,
          locationId: body.locationId ?? null,
          amountMinor: BigInt(body.amountMinor),
          currency: t.currency,
          spentOn: toDateColumn(body.spentOn),
          vendor: body.vendor ?? null,
          note: body.note ?? null,
          recurringMonthly: body.recurringMonthly,
          createdByUserId: requirePrincipal().userId,
        },
      });
      await this.audit.record(tx, { tenantId: t.id, action: "expense.created", entityType: "expense", entityId: e.id, data: { amountMinor: e.amountMinor.toString() } });
      return e;
    });
  }

  /** Removes an expense (kept for history). Removing a monthly template stops future copies. */
  @Delete("expenses/:id")
  @RequiresPermission("finance.manage")
  removeExpense(@Param("id", ParseUUIDPipe) id: string) {
    const t = requireTenant();
    return this.db.run(async (tx) => {
      const res = await tx.expense.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date(), recurringMonthly: false } });
      if (!res.count) throw new NotFoundException();
      await this.audit.record(tx, { tenantId: t.id, action: "expense.deleted", entityType: "expense", entityId: id });
      return { ok: true };
    });
  }

  @Get("expense-categories")
  @RequiresPermission("finance.view")
  categories() {
    return this.db.run((tx) => tx.expenseCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }));
  }

  @Post("expense-categories")
  @RequiresPermission("finance.manage")
  addCategory(@Body(new ZodPipe(expenseCategorySchema)) body: { name: string }) {
    const t = requireTenant();
    return this.db.run(async (tx) => {
      try {
        return await tx.expenseCategory.create({ data: { tenantId: t.id, name: body.name } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ConflictException({ code: "CATEGORY_EXISTS" });
        throw err;
      }
    });
  }

  @Put("budgets")
  @RequiresPermission("finance.manage")
  setBudget(@Body(new ZodPipe(budgetSchema)) body: BudgetInput) {
    const t = requireTenant();
    const month = toDateColumn(`${body.month}-01`);
    return this.db.run(async (tx) => {
      const cat = await tx.expenseCategory.findFirst({ where: { id: body.categoryId } });
      if (!cat) throw new NotFoundException({ code: "CATEGORY_NOT_FOUND" });
      return tx.budget.upsert({
        where: { tenantId_categoryId_month: { tenantId: t.id, categoryId: cat.id, month } },
        create: { tenantId: t.id, categoryId: cat.id, month, amountMinor: BigInt(body.amountMinor), currency: t.currency },
        update: { amountMinor: BigInt(body.amountMinor) },
      });
    });
  }
}
