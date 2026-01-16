/**
 * Admin Routes
 * 
 * WHY: Mount all admin API endpoints
 * RESPONSIBILITY: Route definitions for admin control plane
 * 
 * Phase 1: READ-ONLY endpoints
 * Phase 2: WRITE endpoints (require WRITE scope)
 */

import express from 'express';
import { adminAuth, requireWriteScope } from './auth';

// Import handlers
import * as projectHandlers from './handlers/projects';
import * as messageHandlers from './handlers/messages';
import * as usageHandlers from './handlers/usage';
import * as tierHandlers from './handlers/tiers';
import * as writeHandlers from './handlers/write';

const router = express.Router();

// Apply admin auth to all routes
router.use(adminAuth);

/**
 * PROJECT MANAGEMENT (READ)
 */

// GET /v1/admin/projects - List all projects
router.get('/projects', projectHandlers.listProjects);

// GET /v1/admin/projects/:id - Get project details
router.get('/projects/:id', projectHandlers.getProject);

/**
 * PROJECT MANAGEMENT (WRITE - Phase 2)
 * All require WRITE scope
 */

// PATCH /v1/admin/projects/:id/status - Update project status
router.patch('/projects/:id/status', requireWriteScope, writeHandlers.updateProjectStatus);

// PATCH /v1/admin/projects/:id/limits - Update project limits
router.patch('/projects/:id/limits', requireWriteScope, writeHandlers.updateProjectLimits);

// PATCH /v1/admin/projects/:id/tier - Apply pricing tier
router.patch('/projects/:id/tier', requireWriteScope, writeHandlers.updateProjectTier);

/**
 * MESSAGE OBSERVABILITY
 */

// GET /v1/admin/projects/:id/messages - List messages for project
router.get('/projects/:id/messages', messageHandlers.listMessages);

// GET /v1/admin/messages/:id - Get message details
router.get('/messages/:id', messageHandlers.getMessage);

// GET /v1/admin/messages/:id/events - Get message event timeline
router.get('/messages/:id/events', messageHandlers.getMessageEvents);

/**
 * USAGE ANALYTICS
 */

// GET /v1/admin/projects/:id/usage - Current month usage
router.get('/projects/:id/usage', usageHandlers.getCurrentUsage);

// GET /v1/admin/projects/:id/usage/history - Historical usage
router.get('/projects/:id/usage/history', usageHandlers.getUsageHistory);

/**
 * PRICING TIERS
 */

// GET /v1/admin/tiers - Get all pricing tiers
router.get('/tiers', tierHandlers.getTiers);

export default router;
