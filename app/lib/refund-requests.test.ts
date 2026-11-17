import { describe, it, expect } from "vitest";
import {
  buildRefundRequestEmail,
  findRefundRequestBlocker,
  type RefundRequestFacts,
} from "./refund-requests";

const eligible: RefundRequestFacts = {
  purchasedAt: new Date(2026, 10, 1, 23, 0).toISOString(),
  today: new Date(2026, 10, 5, 12, 0),
  hasPendingRefundRequest: false,
  isTeamPurchase: false,
  lessonCount: 10,
  completedLessonCount: 3,
  secondsWatched: 60 * 60,
};

describe("findRefundRequestBlocker", () => {
  it("allows a Refund Request inside every limit", () => {
    expect(findRefundRequestBlocker(eligible)).toBeNull();
  });

  it("includes the whole fourteenth day of the Refund Window", () => {
    expect(
      findRefundRequestBlocker({
        ...eligible,
        today: new Date(2026, 10, 15, 23, 59),
      })
    ).toBeNull();
  });

  it("closes the Refund Window on the fifteenth day", () => {
    expect(
      findRefundRequestBlocker({ ...eligible, today: new Date(2026, 10, 16) })
    ).toBe("refund-window-closed");
  });

  it("blocks a second Refund Request while one is Pending", () => {
    expect(
      findRefundRequestBlocker({ ...eligible, hasPendingRefundRequest: true })
    ).toBe("pending-refund-request");
  });

  it("blocks Team Purchases", () => {
    expect(
      findRefundRequestBlocker({ ...eligible, isTeamPurchase: true })
    ).toBe("team-purchase");
  });

  it("blocks at the Completion Limit", () => {
    expect(
      findRefundRequestBlocker({ ...eligible, completedLessonCount: 5 })
    ).toBe("completion-limit");
  });

  it("blocks at the Watch Limit", () => {
    expect(
      findRefundRequestBlocker({ ...eligible, secondsWatched: 2 * 60 * 60 })
    ).toBe("watch-limit");
  });
});

describe("buildRefundRequestEmail", () => {
  it("speaks of a refund request, never a reversal or chargeback", () => {
    const email = buildRefundRequestEmail({
      learnerName: "Liam",
      learnerEmail: "liam@example.com",
      courseTitle: "Introduction to TypeScript",
      amount: 7900,
    });

    const text = `${email.subject}\n${email.body}`;
    expect(text).toContain("refund request");
    expect(text).not.toMatch(/reversal|chargeback|cancel/i);
  });
});
