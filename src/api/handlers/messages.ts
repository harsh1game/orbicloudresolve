/**
 * Customer Handlers: Messages
 * 
 * Read-only access to message history.
 * Strictly scoped to authenticated project.
 */
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../auth';
import * as queries from '../queries'; // Customer queries

export async function listMessages(req: Request, res: Response) {
  const projectId = (req as AuthenticatedRequest).projectId;

  // Parse query params
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
  const status = req.query.status as string; // validation in query if needed
  const to = req.query.to as string;

  try {
    // Parallel fetch: data + total count
    // Both queries strictly enforce project_id
    const [messages, total] = await Promise.all([
      queries.getCustomerMessages(projectId, { limit, offset, status, to }),
      queries.getCustomerMessageCount(projectId, { status, to })
    ]);

    res.json({
      data: messages,
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + messages.length < total
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'internal_error' });
  }
}

export async function getMessage(req: Request, res: Response) {
  const projectId = (req as AuthenticatedRequest).projectId;
  const messageId = req.params.id;
  const redactBody = req.query.redact_body === 'true';

  try {
    const message = await queries.getCustomerMessage(projectId, messageId);

    if (!message) {
      return res.status(404).json({ error: 'not_found' });
    }

    if (redactBody) {
      delete message.body;
    }

    res.json(message);
  } catch (error: any) {
    res.status(500).json({ error: 'internal_error' });
  }
}

export async function getMessageEvents(req: Request, res: Response) {
  const projectId = (req as AuthenticatedRequest).projectId;
  const messageId = req.params.id;

  try {
    // First check if message exists and belongs to project
    // (Optimization: can just run query and check empty result, but specific 404 is nicer)
    const message = await queries.getCustomerMessage(projectId, messageId);
    if (!message) {
      return res.status(404).json({ error: 'not_found' });
    }

    const events = await queries.getCustomerMessageEvents(projectId, messageId);

    res.json({
      message_id: messageId,
      data: events
    });
  } catch (error: any) {
    res.status(500).json({ error: 'internal_error' });
  }
}
