import { NextFunction, Request, Response } from "express";
import { QuotaService, quotaKeyFor, quotaService } from "../quota";

/**
 * Usage status: how much of the caller's allowance is left.
 *
 * Exists so a client can show a remaining count and disable its input *before* a question is
 * asked, rather than discovering the ceiling as a 429 on a question the user already typed.
 * The relay in `clean-earth-rovers-server` serves `GET /gilligan/check-quota` from this.
 *
 * **Read-only by construction.** It calls `status`, never `recordRequest`, so a page that polls
 * this endpoint cannot spend the allowance it is displaying - the failure mode a counting status
 * endpoint would have, and an easy one to introduce by accident later, so it is asserted in the
 * unit test rather than left as a comment here.
 *
 * The bucket is resolved with the same `quotaKeyFor` the gate uses, so the number shown is the
 * number that will be enforced. Under `QUERY_QUOTA_SCOPE=global` that bucket is shared, which is
 * honest: the caller really can be refused because of somebody else's spend.
 */
export class UsageController {
  private readonly quota: QuotaService;

  constructor(quota: QuotaService = quotaService) {
    this.quota = quota;
  }

  getUsage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let status;
    try {
      status = await this.quota.status(quotaKeyFor(req));
    } catch (error) {
      next(error);
      return;
    }

    res.status(200).json({
      enabled: status.enabled,
      // Any dimension within `QUERY_QUOTA_WARN_AT` of its ceiling (release plan Q7); each
      // dimension also carries its own `nearLimit` so the page can say which.
      nearLimit: status.nearLimit,
      // Named for what a user counts, not for what the store counts: "questions" is the word the
      // dashboard shows. The wire name is decoupled from `QuotaDimension` deliberately, so
      // renaming either side does not silently reshape the other.
      questions: status.requests,
      tokens: status.tokens,
      reports: status.reports,
      window: status.windowLabel,
      resetsAt: new Date(status.resetAtMs).toISOString(),
    });
  };
}
