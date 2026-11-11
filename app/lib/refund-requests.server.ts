import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  coupons,
  lessonProgress,
  lessons,
  LessonProgressStatus,
  modules,
  purchases,
  refundRequests,
  RefundRequestStatus,
  videoWatchEvents,
} from "~/db/schema";
import {
  findRefundRequestBlocker,
  lastDayOfRefundWindow,
} from "~/lib/refund-requests";

export function getPendingRefundRequest(purchaseId: number) {
  return db
    .select()
    .from(refundRequests)
    .where(
      and(
        eq(refundRequests.purchaseId, purchaseId),
        eq(refundRequests.status, RefundRequestStatus.Pending)
      )
    )
    .get();
}

function getLatestPurchase(userId: number, courseId: number) {
  return db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .orderBy(desc(purchases.createdAt))
    .get();
}

function getLessonIds(courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

function getCompletedLessonCount(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  return (
    db
      .select({ count: sql<number>`count(*)` })
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.userId, userId),
          eq(lessonProgress.status, LessonProgressStatus.Completed),
          inArray(lessonProgress.lessonId, lessonIds)
        )
      )
      .get()?.count ?? 0
  );
}

function getSecondsWatched(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  return db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all()
    .reduce((total, row) => total + row.furthest, 0);
}

// A Team Purchase buys Team Seats for other Learners. It has coupons whether
// or not any seat has been claimed yet.
function isTeamPurchase(purchaseId: number) {
  return Boolean(
    db
      .select({ id: coupons.id })
      .from(coupons)
      .where(eq(coupons.purchaseId, purchaseId))
      .get()
  );
}

/**
 * Whether this Learner may make a Refund Request on their latest Purchase of
 * the course. The course page and the request action both go through here so
 * the rules cannot drift apart. Returns null when there is no Purchase.
 */
export function getRefundRequestEligibility(userId: number, courseId: number) {
  const purchase = getLatestPurchase(userId, courseId);
  if (!purchase) return null;

  const lessonIds = getLessonIds(courseId);

  const blocker = findRefundRequestBlocker({
    purchasedAt: purchase.createdAt,
    today: new Date(),
    hasPendingRefundRequest: Boolean(getPendingRefundRequest(purchase.id)),
    isTeamPurchase: isTeamPurchase(purchase.id),
    lessonCount: lessonIds.length,
    completedLessonCount: getCompletedLessonCount(userId, lessonIds),
    secondsWatched: getSecondsWatched(userId, lessonIds),
  });

  return {
    purchase,
    blocker,
    // A Refund is always the full amount paid on the Purchase — never the
    // course's current list price.
    amount: purchase.amountPaid,
    lastDayOfRefundWindow: lastDayOfRefundWindow(purchase.createdAt),
  };
}
