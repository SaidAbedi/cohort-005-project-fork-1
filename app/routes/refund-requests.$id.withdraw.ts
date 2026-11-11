import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/refund-requests.$id.withdraw";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import { purchases, refundRequests, RefundRequestStatus } from "~/db/schema";
import { eq } from "drizzle-orm";
import { parseParams } from "~/lib/validation";

const withdrawParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// A Learner withdraws their own Pending Refund Request. Only Pending requests
// can be Withdrawn — an Approved or Declined request is already resolved.
export async function action({ params, request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in to withdraw a refund request.", {
      status: 401,
    });
  }

  const { id } = parseParams(params, withdrawParamsSchema);

  const refundRequest = db
    .select({
      id: refundRequests.id,
      status: refundRequests.status,
      learnerId: purchases.userId,
    })
    .from(refundRequests)
    .innerJoin(purchases, eq(refundRequests.purchaseId, purchases.id))
    .where(eq(refundRequests.id, id))
    .get();

  if (!refundRequest || refundRequest.learnerId !== currentUserId) {
    throw data("Refund request not found.", { status: 404 });
  }

  if (refundRequest.status !== RefundRequestStatus.Pending) {
    throw data("Only a pending refund request can be withdrawn.", {
      status: 409,
    });
  }

  db.update(refundRequests)
    .set({
      status: RefundRequestStatus.Withdrawn,
      resolvedAt: new Date().toISOString(),
      resolvedByUserId: currentUserId,
    })
    .where(eq(refundRequests.id, id))
    .run();

  return { ok: true };
}
