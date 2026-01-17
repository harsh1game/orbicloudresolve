/**
 * Google Email API Provider (MOCKED)
 * 
 * WHY: Handles email delivery via Google Email API
 * RESPONSIBILITY: Transform message format, send via Google API, classify errors
 * 
 * CURRENT STATE: Mocked - logs payload instead of sending
 * FUTURE: Will use real Google Email API with OAuth credentials
 */

import { Provider, Message, ProviderResult } from './provider';
import { logger } from '../admin/lib/logger';

export class GoogleEmailProvider implements Provider {
  /**
   * Send email via Google Email API
   * 
   * STUB: Currently logs message and returns mocked success/failure
   * 
   * Error Classification:
   * - Retryable: Rate limits, network errors, temporary API failures
   * - Permanent: Invalid email, authentication failed, bad request
   */
  async send(message: Message): Promise<ProviderResult> {
    logger.info('GoogleEmailProvider: Sending email (MOCKED)', {
      messageId: message.id,
      from: message.from_address,
      to: message.to_address,
      subject: message.subject,
    });

    // Mock the Google API request payload
    const googlePayload = {
      raw: Buffer.from(
        `From: ${message.from_address}\n` +
        `To: ${message.to_address}\n` +
        `Subject: ${message.subject || '(no subject)'}\n\n` +
        message.body
      ).toString('base64'),
    };

    logger.debug('Google API payload (MOCKED)', { payload: googlePayload });

    // Simulate different failure scenarios for testing
    const random = Math.random();

    // 10% transient failures (retryable)
    if (random < 0.1) {
      logger.warn('GoogleEmailProvider: Simulated transient failure', {
        messageId: message.id,
      });

      return {
        success: false,
        retryable: true, // Worker will retry
        error_message: 'Rate limit exceeded (mock)',
        provider_response: {
          error: {
            code: 429,
            message: 'Rate limit exceeded',
            status: 'RESOURCE_EXHAUSTED',
          },
        },
      };
    }

    // 5% permanent failures (not retryable)
    if (random < 0.15) {
      logger.warn('GoogleEmailProvider: Simulated permanent failure', {
        messageId: message.id,
      });

      return {
        success: false,
        retryable: false, // Worker will NOT retry
        error_message: 'Invalid recipient email address (mock)',
        provider_response: {
          error: {
            code: 400,
            message: 'Invalid email address',
            status: 'INVALID_ARGUMENT',
          },
        },
      };
    }

    // 85% success
    const mockResponse = {
      id: `mock_google_${Date.now()}`,
      threadId: `thread_${message.id}`,
      labelIds: ['SENT'],
    };

    logger.info('GoogleEmailProvider: Email sent successfully (MOCKED)', {
      messageId: message.id,
      googleMessageId: mockResponse.id,
    });

    return {
      success: true,
      retryable: false, // Not applicable for success
      provider_response: mockResponse,
    };
  }
}
