/**
 * Provider Interface
 * 
 * WHY: Abstract message delivery across different providers (email, SMS, etc.)
 * RESPONSIBILITY: Define contract that all delivery providers must implement
 * 
 * This allows swapping providers without changing worker logic
 */

export interface Message {
  id: string;
  project_id: string;
  type: string;
  from_address: string;
  to_address: string;
  subject: string | null;
  body: string;
}

export interface ProviderResult {
  success: boolean;
  retryable: boolean; // Can this failure be retried?
  provider_response?: any;
  error_message?: string;
}

/**
 * All providers must implement this interface
 */
export interface Provider {
  /**
   * Send a message through this provider
   * Returns success/failure, retryability, and provider-specific response data
   */
  send(message: Message): Promise<ProviderResult>;
}
