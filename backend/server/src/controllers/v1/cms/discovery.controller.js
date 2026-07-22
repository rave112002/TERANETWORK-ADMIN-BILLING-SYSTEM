/**
 * Discovery controller — run sweeps + review staged items (§3.1.1).
 * =================================================================
 *
 *   POST /run                 -> run a sweep, stage results   (super_admin, noc)
 *   GET  /runs                -> list recent runs             (any staff)
 *   GET  /runs/:id/items      -> staged items (by bucket)     (any staff)
 *
 * The import endpoint (which actually creates live records) is added separately
 * so the write path can be built carefully on its own. Everything here is
 * read/stage only — no live customer/subscription/ONU rows are created.
 */

import { Router } from "express";
import { z } from "zod";

import { catchAsync, validateBody, validateParams, validateQuery } from "../../../utils/catchAsync.js";
import { requireRole } from "../../../middlewares/rbac.middleware.js";
import {
  runDiscovery,
  getRunItems,
  listRuns,
  importItem,
} from "../../../lib/discovery/discovery.service.js";

const router = Router();

const runSchema = z.object({
  oltId: z.coerce.number().int().positive(),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const itemsQuerySchema = z.object({
  bucket: z.enum(["matched", "new", "orphaned"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

// Staff-confirmed overrides for importing an item. All optional — the discovered
// data fills the gaps. The service picks the fields relevant to the item's
// source (ONU fields for OLT items, customer fields for MikroTik items).
const importSchema = z.object({
  // ONU (OLT item) overrides
  serialNo: z.string().trim().min(1).max(64).optional(),
  mac: z.string().trim().max(32).optional(),
  model: z.string().trim().max(80).optional(),
  onuIndex: z.string().trim().max(32).optional(),
  oltId: z.coerce.number().int().positive().optional(),
  ponPortId: z.coerce.number().int().positive().optional(),
  napId: z.coerce.number().int().positive().optional(),
  napPort: z.coerce.number().int().min(0).max(255).optional(),
  provisioningState: z.enum(["unprovisioned", "active", "suspended", "offline"]).optional(),
  // Customer (MikroTik item) overrides
  name: z.string().trim().min(1).max(160).optional(),
  email: z.string().trim().email().max(190).optional(),
  phone: z.string().trim().max(32).optional(),
  address: z.string().trim().max(255).optional(),
  gps_lat: z.number().min(-90).max(90).optional(),
  gps_lng: z.number().min(-180).max(180).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

/**
 * POST /run — sweep an OLT + the MikroTik and stage the reconciled results.
 * super_admin / noc only (it reads network devices).
 */
router.post(
  "/run",
  requireRole("super_admin", "noc"),
  validateBody(runSchema),
  catchAsync(async (req, res) => {
    const result = await runDiscovery(req.db, {
      oltId: req.body.oltId,
      actorId: req.user.id,
    });
    return res.sendSuccess("Discovery run completed", result, 201);
  })
);

/**
 * GET /runs — recent discovery runs (newest first). Any authenticated staff.
 */
router.get(
  "/runs",
  catchAsync(async (req, res) => {
    const runs = await listRuns(req.db);
    return res.sendSuccess("Discovery runs retrieved", runs);
  })
);

/**
 * GET /runs/:id/items — staged items for a run, optionally filtered by bucket.
 */
router.get(
  "/runs/:id/items",
  validateParams(idParamSchema),
  validateQuery(itemsQuerySchema),
  catchAsync(async (req, res) => {
    const { bucket, limit, offset } = req.validatedQuery;
    const items = await getRunItems(req.db, req.params.id, { bucket, limit, offset });
    return res.sendSuccess("Discovered items retrieved", items);
  })
);

/**
 * POST /items/:id/import — import a staged 'new' item into the live tables.
 * OLT item → creates an ONU; MikroTik item → creates a customer. The guarded
 * write path. super_admin / noc only.
 */
router.post(
  "/items/:id/import",
  requireRole("super_admin", "billing", "noc"),
  validateParams(idParamSchema),
  validateBody(importSchema),
  catchAsync(async (req, res) => {
    const result = await importItem(req.db, req.params.id, {
      actorId: req.user.id,
      overrides: req.body,
    });
    return res.sendSuccess("Item imported", result, 201);
  })
);

export default router;
