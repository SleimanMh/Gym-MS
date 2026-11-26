import { renderEmail, type EmailContext } from "../../src/modules/notifications/templates";

const base: EmailContext = {
  lang: "en",
  gymName: "IronFit Gym",
  color: "#2563EB",
  firstName: "Ben",
  bookingUrl: "http://localhost:3000/book/ironfit",
  className: "HIIT",
  when: "Monday 16 November at 07:00",
  location: "Downtown",
};

describe("member email templates", () => {
  it("renders every kind in English and Arabic", () => {
    const kinds = [
      "booking.created",
      "booking.cancelled",
      "booking.reminder",
      "waitlist.promoted",
      "session.cancelled",
      "membership.expiring",
      "member.login_code",
    ] as const;
    for (const kind of kinds) {
      for (const lang of ["en", "ar"] as const) {
        const r = renderEmail(kind, { ...base, lang, code: "123456", ttlMin: 10, planName: "Monthly", endsOn: "2026-12-01", daysLeft: 7 });
        expect(r.subject.length).toBeGreaterThan(5);
        expect(r.html).toContain(`dir="${lang === "ar" ? "rtl" : "ltr"}"`);
        expect(r.text).not.toMatch(/<[a-z]/i);
      }
    }
  });

  it("uses the right subject per event", () => {
    expect(renderEmail("waitlist.promoted", base).subject).toBe("A spot opened up: HIIT — Monday 16 November at 07:00");
    expect(renderEmail("member.login_code", { ...base, code: "654321", ttlMin: 10 }).subject).toContain("654321");
    expect(renderEmail("booking.cancelled", { ...base, late: true, creditReturned: false }).text).toContain("late cancellation");
  });

  it("escapes gym and member data", () => {
    const r = renderEmail("booking.created", { ...base, firstName: "<script>x</script>", className: "A&B" });
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
    expect(r.html).toContain("A&amp;B");
  });
});
