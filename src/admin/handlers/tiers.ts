/**
 * Tiers Handler
 * 
 * WHY: Handle admin endpoint for pricing tiers
 * RESPONSIBILITY: Return configured pricing tiers
 */

import { Request, Response } from 'express';
import { getAllTiers } from '../tiers';

/**
 * GET /v1/admin/tiers
 * Get all pricing tiers
 */
export async function getTiers(req: Request, res: Response): Promise<void> {
  const tiers = getAllTiers();

  res.json({
    tiers: tiers.map((t) => ({
      id: t.id,
      name: t.name,
      limits: t.limits,
      price_monthly_usd: t.price_monthly_usd,
      features: t.features,
    })),
  });
}
