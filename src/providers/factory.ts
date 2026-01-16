/**
 * Provider Factory
 * 
 * WHY: Select the correct provider based on message type
 * RESPONSIBILITY: Map message types to provider instances
 * 
 * Currently only supports email via Google
 * Future: Add SMS (Twilio), WhatsApp, Push notifications
 */

import { Provider } from './provider';
import { GoogleEmailProvider } from './google-email';

// Singleton instances
const googleEmailProvider = new GoogleEmailProvider();

/**
 * Get the appropriate provider for a message type
 * Throws error if message type is not supported
 */
export function getProvider(messageType: string): Provider {
  switch (messageType) {
    case 'email':
      return googleEmailProvider;

    // Future providers:
    // case 'sms':
    //   return twilioSmsProvider;
    // case 'whatsapp':
    //   return twilioWhatsAppProvider;
    // case 'push':
    //   return firebasePushProvider;

    default:
      throw new Error(`Unsupported message type: ${messageType}`);
  }
}
