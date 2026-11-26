import { cookies } from "next/headers";
import { ar1, en1, errorsAr as errorsAr1, errorsEn as errorsEn1 } from "./messages-phase1";
import { ar3, en3, errors3Ar, errors3En } from "./messages-phase3";

const errorsEn = { ...errorsEn1, ...errors3En };
const errorsAr = { ...errorsAr1, ...errors3Ar };

/** Every UI string goes through here (CLAUDE.md). Keys are flat; add en and ar together. */
const enBase = {
  "app.name": "Gym Manager",
  "nav.dashboard": "Dashboard",
  "nav.schedule": "Schedule",
  "nav.bookings": "Bookings",
  "nav.members": "Members",
  "nav.sales": "Sales",
  "nav.staff": "Staff",
  "nav.finance": "Finance",
  "nav.settings": "Settings",
  "nav.designSystem": "Design system",
  "nav.platform": "Platform console",
  "top.search": "Search members by name or phone",
  "top.location": "Location",
  "top.allLocations": "All locations",
  "top.logout": "Log out",
  "lang.switch": "عربي",
  "dash.title": "Owner overview",
  "dash.revenue": "Revenue this month",
  "dash.mrr": "MRR",
  "dash.activeMembers": "Active members",
  "dash.checkinsToday": "Check-ins today",
  "dash.vsLast": "vs last month",
  "dash.empty": "No classes yet",
  "dash.emptyAction": "Create your first class",
  "locked.title": "Available on {plan}",
  "locked.body": "{feature} isn't part of your current plan.",
  "locked.cta": "See plans",
  "soon.title": "Coming in {phase}",
  "soon.body": "This area is planned for {phase} of the roadmap.",
  "settings.title": "Settings",
  "settings.plan": "Plan and features",
  "settings.currentPlan": "Current plan",
  "settings.locations": "Locations",
  "settings.addLocation": "Add location",
  "settings.locationName": "Location name",
  "settings.unlimited": "Unlimited",
  "common.save": "Save",
  "common.create": "Create",
  "common.name": "Name",
  "common.status": "Status",
  "common.plan": "Plan",
  "common.included": "Included",
  "common.notIncluded": "Not included",
  "login.title": "Sign in",
  "login.subtitle": "Development sign-in: pick a seeded user. Keycloak sign-in replaces this.",
  "login.as": "Sign in as",
  "login.gym": "Gym",
  "login.platform": "Platform (no gym)",
  "platform.title": "Tenants",
  "platform.create": "Create tenant",
  "platform.slug": "Slug",
  "platform.ownerEmail": "Owner email",
  "platform.ownerFirst": "Owner first name",
  "platform.ownerLast": "Owner last name",
  "platform.language": "Default language",
  "platform.assign": "Change plan",
} as const;

const en = { ...enBase, ...en1, ...en3 };
export type MessageKey = keyof typeof en;

const arBase: Record<keyof typeof enBase, string> = {
  "app.name": "إدارة النادي",
  "nav.dashboard": "لوحة التحكم",
  "nav.schedule": "الجدول",
  "nav.bookings": "الحجوزات",
  "nav.members": "الأعضاء",
  "nav.sales": "المبيعات",
  "nav.staff": "الموظفون",
  "nav.finance": "المالية",
  "nav.settings": "الإعدادات",
  "nav.designSystem": "نظام التصميم",
  "nav.platform": "لوحة المنصة",
  "top.search": "ابحث عن الأعضاء بالاسم أو الهاتف",
  "top.location": "الفرع",
  "top.allLocations": "كل الفروع",
  "top.logout": "تسجيل الخروج",
  "lang.switch": "English",
  "dash.title": "نظرة عامة",
  "dash.revenue": "إيرادات هذا الشهر",
  "dash.mrr": "الإيراد الشهري المتكرر",
  "dash.activeMembers": "الأعضاء النشطون",
  "dash.checkinsToday": "تسجيلات الدخول اليوم",
  "dash.vsLast": "مقارنة بالشهر الماضي",
  "dash.empty": "لا توجد حصص بعد",
  "dash.emptyAction": "أنشئ حصتك الأولى",
  "locked.title": "متاح في باقة {plan}",
  "locked.body": "{feature} غير مشمول في باقتك الحالية.",
  "locked.cta": "عرض الباقات",
  "soon.title": "قريبًا في {phase}",
  "soon.body": "هذا القسم مخطط له في {phase} من خارطة الطريق.",
  "settings.title": "الإعدادات",
  "settings.plan": "الباقة والميزات",
  "settings.currentPlan": "الباقة الحالية",
  "settings.locations": "الفروع",
  "settings.addLocation": "إضافة فرع",
  "settings.locationName": "اسم الفرع",
  "settings.unlimited": "غير محدود",
  "common.save": "حفظ",
  "common.create": "إنشاء",
  "common.name": "الاسم",
  "common.status": "الحالة",
  "common.plan": "الباقة",
  "common.included": "مشمول",
  "common.notIncluded": "غير مشمول",
  "login.title": "تسجيل الدخول",
  "login.subtitle": "دخول بيئة التطوير: اختر مستخدمًا تجريبيًا. سيحل Keycloak محل هذه الصفحة.",
  "login.as": "الدخول باسم",
  "login.gym": "النادي",
  "login.platform": "المنصة (بدون نادٍ)",
  "platform.title": "المستأجرون",
  "platform.create": "إنشاء مستأجر",
  "platform.slug": "المعرّف",
  "platform.ownerEmail": "بريد المالك",
  "platform.ownerFirst": "الاسم الأول للمالك",
  "platform.ownerLast": "اسم عائلة المالك",
  "platform.language": "اللغة الافتراضية",
  "platform.assign": "تغيير الباقة",
};

const ar: Record<MessageKey, string> = { ...arBase, ...ar1, ...ar3 };

export type Lang = "en" | "ar";
const dictionaries: Record<Lang, Record<MessageKey, string>> = { en, ar };

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get("lang")?.value;
  return v === "ar" ? "ar" : "en";
}

export type T = (key: MessageKey, vars?: Record<string, string>) => string;

export function translator(lang: Lang): T {
  const dict = dictionaries[lang];
  return (key, vars) => {
    let s = dict[key] ?? en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
    return s;
  };
}

/** API error code → message in the UI language. */
export function errorText(lang: Lang, code: string | undefined | null): string {
  const dict = lang === "ar" ? errorsAr : errorsEn;
  return (code && (dict[code] ?? errorsEn[code])) || dict.generic!;
}

export async function getT(): Promise<{ t: T; lang: Lang; dir: "ltr" | "rtl"; err: (code?: string | null) => string }> {
  const lang = await getLang();
  return {
    t: translator(lang),
    lang,
    dir: lang === "ar" ? "rtl" : "ltr",
    err: (code) => errorText(lang, code),
  };
}
