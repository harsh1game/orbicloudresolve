/**
 * Message Handlers
 * 
 * WHY: Handle admin endpoints for message observability
 * RESPONSIBILITY: List messages, get message details, get event timeline
 */

import { Request, Response } from 'express';
import { logger } from '../../../admin/lib/logger';
import * as queries from '../queries';

/**
 * Validation helpers
 */
function validatePagination(limit?: string, offset?: string): { limit: number; offset: number } {
  const parsedLimit = limit ? parseInt(limit, 10) : 50;
  const parsedOffset = offset ? parseInt(offset, 10) : 0;

  const validLimit = Math.min(Math.max(1, parsedLimit), 100);
  const validOffset = Math.max(0, parsedOffset);

  return { limit: validLimit, offset: validOffset };
}

/**
 * GET /v1/admin/projects/:id/messages
 * List messages for a project with filtering
 */
export async function listMessages(req: Request, res: Response): Promise<void> {
  try {
    const { id: projectId } = req.params;
    const { status, type, to, from, limit, offset } = req.query;

    // Validate pagination
    const pagination = validatePagination(limit as string, offset as string);

    // Validate filters
    const validStatuses = ['queued', 'delivered', 'failed', 'dead'];
    const validTypes = ['email', 'sms', 'whatsapp', 'push'];

    const statusFilter =
      status && validStatuses.includes(status as string) ? (status as string) : undefined;
    const typeFilter = type && validTypes.includes(type as string) ? (type as string) : undefined;

    const filters = {
      status: statusFilter,
      type: typeFilter,
      to: to as string,
      from: from as string,
    };

    // Get messages
    const messages = await queries.getMessagesByProject(projectId, filters, pagination);

    // Get total count
    const total = await queries.getTotalMessagesCount(projectId, filters);

    // Build response
    const response = {
      messages: messages.map((m) => ({
        id: m.id,
        type: m.type,
        status: m.status,
        from_address: m.from_address,
        to_address: m.to_address,
        subject: m.subject,
        attempts: m.attempts,
        created_at: m.created_at,
        updated_at: m.updated_at,
        idempotency_key: m.idempotency_key,
      })),
      pagination: {
        total,
        limit: pagination.limit,
        offset: pagination.offset,
        has_more: pagination.offset + pagination.limit < total,
      },
      filters_applied: {
        status: statusFilter || null,
        type: typeFilter || null,
        to: to || null,
        from: from || null,
      },
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Failed to list messages', { error: error.message, projectId: req.params.id });
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to list messages',
    });
  }
}

/**
 * GET /v1/admin/messages/:id
 * Get full message details
 */
export async function getMessage(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    // Get message
    const message = await queries.getMessageById(id);

    if (!message) {
      res.status(404).json({
        error: 'not_found',
        message: 'Message not found',
      });
      return;
    }

    // Build response
    const response = {
      id: message.id,
      project_id: message.project_id,
      type: message.type,
      status: message.status,
      from_address: message.from_address,
      to_address: message.to_address,
      subject: message.subject,
      body: message.body,
      metadata: message.metadata,
      idempotency_key: message.idempotency_key,
      attempts: message.attempts,
      max_attempts: message.max_attempts,
      next_attempt_at: message.next_attempt_at,
      scheduled_for: message.scheduled_for,
      created_at: message.created_at,
      updated_at: message.updated_at,
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Failed to get message', { error: error.message, messageId: req.params.id });
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to get message',
    });
  }
}

/**
 * GET /v1/admin/messages/:id/events
 * Get event timeline for a message
 */
export async function getMessageEvents(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    // Verify message exists
    const message = await queries.getMessageById(id);

    if (!message) {
      res.status(404).json({
        error: 'not_found',
        message: 'Message not found',
      });
      return;
    }

    // Get events
    const events = await queries.getMessageEvents(id);

    // Build response
    const response = {
      message_id: id,
      events: events.map((e) => ({
        id: e.id,
        event_type: e.event_type,
        created_at: e.created_at,
        provider_response: e.provider_response,
      })),
      total_events: events.length,
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Failed to get message events', {
      error: error.message,
      messageId: req.params.id,
    });
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to get message events',
    });
  }
}
