/**
 * System settings controller.
 * ===========================
 *
 * Exposes runtime-tunable config from the `system_settings` table. Today the
 * one that matters is the DRY_RUN kill switch:
 *
 *   GET /dry-run   -> read current value           (any authenticated staff)
 *   PUT /dry-run   -> turn the kill switch on/off   (super_admin only)
 *
 * When DRY_RUN is ON, the provisioning worker logs the command it WOULD send
 * (action='dry_run') but never touches a device — a global "rehearse only" mode.
 * Toggling it is a sensitive action, so it's super_admin-only and audited.
 *
 * Mounted at /api/v1/system/settings (see system.route.js).
 */

import { Router } from "express";
import { z } from "zod";

import { catchAsync, validateBody } from "../../../utils/catchAsync.js";
import { requireRole } from "../../../middlewares/rbac.middleware.js";
import { writeAudit, getAuditContext } from "../../../utils/audit.js";
import { isDryRun, setSetting } from "../../../lib/settings/settings.service.js";

const router = Router();

const dryRunSchema = z.object({
  enabled: z.boolean(),
});

/**
 * GET /dry-run — current kill-switch state. Any authenticated staff may read.
 */
router.get(
  "/dry-run",
  catchAsync(async (req, res) => {
    const enabled = await isDryRun(req.db);
    return res.sendSuccess("DRY_RUN retrieved", { key: "DRY_RUN", enabled });
  })
);

/**
 * PUT /dry-run — turn the kill switch on/off. super_admin only. Audited.
 * Body: { "enabled": true | false }
 */
router.put(
  "/dry-run",
  requireRole("super_admin"),
  validateBody(dryRunSchema),
  catchAsync(async (req, res) => {
    const { enabled } = req.body;
    const before = await isDryRun(req.db);

    const conn = await req.db.beginTransaction();
    try {
      // setSetting works with the transaction connection so the change and its
      // audit row commit together.
      await setSetting(conn, "DRY_RUN", enabled ? "true" : "false", req.user.id);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "system_setting",
        entityId: 0, // system_settings is keyed by string, not a numeric id
        action: "update",
        before: { key: "DRY_RUN", enabled: before },
        after: { key: "DRY_RUN", enabled },
      });

      await req.db.commit(conn);
    } catch (err) {
      await req.db.rollback(conn);
      throw err;
    }

    return res.sendSuccess(`DRY_RUN ${enabled ? "enabled" : "disabled"}`, {
      key: "DRY_RUN",
      enabled,
    });
  })
);

export default router;
