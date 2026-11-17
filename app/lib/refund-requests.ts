import { formatPrice } from "~/lib/utils";

// The rules for when a Learner may make a Refund Request. Words follow
// GLOSSARY.md: a Refund Request is what the Learner sends; a Refund is the
// money that comes back once the Cadence team has Approved it.

export const REFUND_WINDOW_DAYS = 14;
export const WATCH_LIMIT_SECONDS = 2 * 60 * 60;
export const COMPLETION_LIMIT = 0.5;

export type RefundRequestFacts = {
  purchasedAt: string;
  today: Date;
  hasPendingRefundRequest: boolean;
  isTeamPurchase: boolean;
  lessonCount: number;
  completedLessonCount: number;
  secondsWatched: number;
};

export type RefundRequestBlocker =
  | "pending-refund-request"
  | "team-purchase"
  | "refund-window-closed"
  | "completion-limit"
  | "watch-limit";

export const REFUND_REQUEST_BLOCKER_MESSAGES: Record<
  RefundRequestBlocker,
  string
> = {
  "pending-refund-request":
    "You already have a pending refund request for this course.",
  "team-purchase": "Refund requests are not available for team purchases.",
  "refund-window-closed": `The ${REFUND_WINDOW_DAYS}-day refund window has closed.`,
  "completion-limit":
    "You have completed half or more of this course, so it can no longer be refunded.",
  "watch-limit": `You have watched ${WATCH_LIMIT_SECONDS / 3600} hours or more of this course, so it can no longer be refunded.`,
};

// The Refund Window is counted in whole days, not hours — a Learner who buys
// at 23:00 still gets the whole of their fourteenth day.
export function calendarDay(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

export function lastDayOfRefundWindow(purchasedAt: string): string {
  const deadline = new Date(purchasedAt);
  deadline.setDate(deadline.getDate() + REFUND_WINDOW_DAYS);
  return calendarDay(deadline);
}

/** Why this Learner cannot make a Refund Request, or null if they can. */
export function findRefundRequestBlocker(
  facts: RefundRequestFacts
): RefundRequestBlocker | null {
  if (facts.hasPendingRefundRequest) return "pending-refund-request";
  if (facts.isTeamPurchase) return "team-purchase";

  const today = calendarDay(facts.today);
  const purchasedDay = calendarDay(new Date(facts.purchasedAt));
  if (today < purchasedDay || today > lastDayOfRefundWindow(facts.purchasedAt)) {
    return "refund-window-closed";
  }

  if (
    facts.lessonCount > 0 &&
    facts.completedLessonCount / facts.lessonCount >= COMPLETION_LIMIT
  ) {
    return "completion-limit";
  }

  if (facts.secondsWatched >= WATCH_LIMIT_SECONDS) return "watch-limit";

  return null;
}

/**
 * The confirmation the Learner gets in their inbox. There is no mail
 * transport wired up yet, so the built message goes to the server log.
 */
export function buildRefundRequestEmail(input: {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  amount: number;
}) {
  return {
    to: input.learnerEmail,
    subject: `Refund request received — ${input.courseTitle}`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `We have your refund request for "${input.courseTitle}".`,
      `If the Cadence team approves it, we will send ${formatPrice(input.amount)}, the amount you paid, back to the card you paid with, and your access to the course will end.`,
      "",
      "The Cadence team reads every refund request by hand. You do not need to do anything else — we will email you again once your request has been approved or declined.",
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}
