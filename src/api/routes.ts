/**
 * Customer API Routes
 * 
 * Base: /v1
 * Auth: Required (Project API Key)
 * 
 * Strictly scoped to authenticated project.
 */

import express from 'express';
// Note: authMiddleware is applied in server.ts before these routes, 
// or we can apply it here. Best practice: apply it here to be explicit.
import { authMiddleware } from './auth';

import * as meHandlers from './handlers/me';
import * as messageHandlers from './handlers/messages';
import * as usageHandlers from './handlers/usage';

const router = express.Router();

// Apply auth to all customer routes
router.use(authMiddleware);

/**
 * Identity & Limits
 */
router.get('/me', meHandlers.getMe);

/**
 * Messages (Read-Only)
 */
router.get('/messages', messageHandlers.listMessages);
router.get('/messages/:id', messageHandlers.getMessage);
router.get('/messages/:id/events', messageHandlers.getMessageEvents);

/**
 * Usage Analytics
 */
router.get('/usage', usageHandlers.getCurrentUsage);
router.get('/usage/history', usageHandlers.getUsageHistory);

export default router;
