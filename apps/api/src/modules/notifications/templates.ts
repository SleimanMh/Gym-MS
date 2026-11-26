/**
 * Member emails, English and Arabic (PLAN.md section 11, "Notifications to members").
 * Plain, gym-branded HTML. Phase 4 moves these into notification_templates so gyms can edit them.
 */

export type EmailKind =
  | "booking.created"
  | "booking.cancelled"
  | "booking.reminder"
  | "waitlist.promoted"
  | "session.cancelled"
  | "membership.expiring"
  | "member.login_code";

export interface EmailContext {
  lang: "en" | "ar";
  gymName: string;
  color: string;
  firstName: string;
  bookingUrl: string;
  className?: string;
  when?: string;
  location?: string;
  late?: boolean;
  creditReturned?: boolean;
  reason?: string | null;
  code?: string;
  ttlMin?: number;
  planName?: string;
  endsOn?: string;
  daysLeft?: number;
}

type Copy = { subject: string; lines: string[]; cta?: string };

const en = (c: EmailContext): Record<EmailKind, Copy> => ({
  "booking.created": {
    subject: `Booked: ${c.className} — ${c.when}`,
    lines: [`You're booked into ${c.className} on ${c.when} at ${c.location}.`, "See you there!"],
    cta: "Manage my bookings",
  },
  "booking.cancelled": {
    subject: `Cancelled: ${c.className} — ${c.when}`,
    lines: [
      `Your booking for ${c.className} on ${c.when} is cancelled.`,
      c.late
        ? c.creditReturned
          ? "It was a late cancellation, but your class credit has been returned."
          : "This was a late cancellation, so the class credit was used."
        : c.creditReturned
          ? "Your class credit has been returned."
          : "",
    ].filter(Boolean),
    cta: "Book another class",
  },
  "booking.reminder": {
    subject: `Reminder: ${c.className} at ${c.when}`,
    lines: [`Your class ${c.className} starts ${c.when} at ${c.location}.`, "Can't make it? Cancel so someone on the waitlist can come."],
    cta: "Manage my bookings",
  },
  "waitlist.promoted": {
    subject: `A spot opened up: ${c.className} — ${c.when}`,
    lines: [`Good news — you moved off the waitlist and are now booked into ${c.className} on ${c.when} at ${c.location}.`],
    cta: "Manage my bookings",
  },
  "session.cancelled": {
    subject: `Class cancelled: ${c.className} — ${c.when}`,
    lines: [
      `Sorry — ${c.gymName} cancelled ${c.className} on ${c.when}.`,
      ...(c.reason ? [`Reason: ${c.reason}`] : []),
      "Any class credit you used has been returned.",
    ],
    cta: "Book another class",
  },
  "membership.expiring": {
    subject: `Your ${c.planName} membership ends ${c.daysLeft === 1 ? "tomorrow" : `in ${c.daysLeft} days`}`,
    lines: [`Your ${c.planName} membership at ${c.gymName} ends on ${c.endsOn}.`, "Renew at the front desk to keep booking classes."],
  },
  "member.login_code": {
    subject: `${c.code} is your ${c.gymName} sign-in code`,
    lines: [`Your sign-in code is <strong style="font-size:24px;letter-spacing:4px">${c.code}</strong>`, `It expires in ${c.ttlMin} minutes. If you didn't ask for it, ignore this email.`],
  },
});

const ar = (c: EmailContext): Record<EmailKind, Copy> => ({
  "booking.created": {
    subject: `تم الحجز: ${c.className} — ${c.when}`,
    lines: [`تم حجزك في حصة ${c.className} يوم ${c.when} في ${c.location}.`, "نراك هناك!"],
    cta: "إدارة حجوزاتي",
  },
  "booking.cancelled": {
    subject: `تم الإلغاء: ${c.className} — ${c.when}`,
    lines: [
      `تم إلغاء حجزك في ${c.className} يوم ${c.when}.`,
      c.late
        ? c.creditReturned
          ? "كان الإلغاء متأخرًا، لكن تمت إعادة رصيد الحصة."
          : "كان الإلغاء متأخرًا، لذلك تم احتساب رصيد الحصة."
        : c.creditReturned
          ? "تمت إعادة رصيد الحصة إلى حسابك."
          : "",
    ].filter(Boolean),
    cta: "احجز حصة أخرى",
  },
  "booking.reminder": {
    subject: `تذكير: ${c.className} الساعة ${c.when}`,
    lines: [`تبدأ حصتك ${c.className} ${c.when} في ${c.location}.`, "إذا لم تتمكن من الحضور، ألغِ الحجز ليستفيد شخص من قائمة الانتظار."],
    cta: "إدارة حجوزاتي",
  },
  "waitlist.promoted": {
    subject: `توفر مكان: ${c.className} — ${c.when}`,
    lines: [`خبر سار — انتقلت من قائمة الانتظار وأصبحت محجوزًا في ${c.className} يوم ${c.when} في ${c.location}.`],
    cta: "إدارة حجوزاتي",
  },
  "session.cancelled": {
    subject: `أُلغيت الحصة: ${c.className} — ${c.when}`,
    lines: [
      `نعتذر — ألغى ${c.gymName} حصة ${c.className} يوم ${c.when}.`,
      ...(c.reason ? [`السبب: ${c.reason}`] : []),
      "تمت إعادة أي رصيد حصص استخدمته.",
    ],
    cta: "احجز حصة أخرى",
  },
  "membership.expiring": {
    subject: c.daysLeft === 1 ? `ينتهي اشتراكك ${c.planName} غدًا` : `ينتهي اشتراكك ${c.planName} خلال ${c.daysLeft} أيام`,
    lines: [`ينتهي اشتراكك ${c.planName} في ${c.gymName} بتاريخ ${c.endsOn}.`, "جدّد اشتراكك في الاستقبال لتستمر في حجز الحصص."],
  },
  "member.login_code": {
    subject: `${c.code} هو رمز الدخول إلى ${c.gymName}`,
    lines: [`رمز الدخول الخاص بك هو <strong style="font-size:24px;letter-spacing:4px">${c.code}</strong>`, `ينتهي خلال ${c.ttlMin} دقائق. إذا لم تطلبه، تجاهل هذه الرسالة.`],
  },
});

const escape = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

export function renderEmail(kind: EmailKind, raw: EmailContext): { subject: string; html: string; text: string } {
  // Everything except the code markup we add ourselves is user/gym data: escape it.
  const c: EmailContext = {
    ...raw,
    gymName: escape(raw.gymName),
    firstName: escape(raw.firstName),
    className: raw.className && escape(raw.className),
    location: raw.location && escape(raw.location),
    reason: raw.reason && escape(raw.reason),
    planName: raw.planName && escape(raw.planName),
  };
  const copy = (c.lang === "ar" ? ar : en)(c)[kind];
  const dir = c.lang === "ar" ? "rtl" : "ltr";
  const hello = c.lang === "ar" ? `مرحبًا ${c.firstName}،` : `Hi ${c.firstName},`;
  const html = `<!doctype html><html lang="${c.lang}" dir="${dir}"><body style="margin:0;background:#f8fafc;font-family:Inter,'IBM Plex Sans Arabic',Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border:1px solid #e2e8f0;border-radius:8px">
<tr><td style="padding:20px 24px;border-bottom:3px solid ${c.color};font-weight:600;font-size:18px">${c.gymName}</td></tr>
<tr><td style="padding:24px;font-size:16px;line-height:1.6">
<p style="margin:0 0 12px">${hello}</p>
${copy.lines.map((l) => `<p style="margin:0 0 12px">${l}</p>`).join("\n")}
${copy.cta ? `<p style="margin:20px 0 0"><a href="${c.bookingUrl}" style="background:${c.color};color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block">${copy.cta}</a></p>` : ""}
</td></tr></table></td></tr></table></body></html>`;
  const text = [hello, ...copy.lines.map((l) => l.replace(/<[^>]+>/g, "")), copy.cta ? `${copy.cta}: ${c.bookingUrl}` : ""]
    .filter(Boolean)
    .join("\n\n");
  return { subject: copy.subject.replace(/&amp;/g, "&"), html, text };
}
