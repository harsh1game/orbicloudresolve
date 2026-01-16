/**
 * Pricing Tiers Configuration
 * 
 * WHY: Define pricing tiers without database or payment integration
 * RESPONSIBILITY: Configuration-only pricing structure
 * 
 * No Stripe, no payments - just config for future monetization
 */

export interface PricingTier {
  id: string;
  name: string;
  limits: {
    monthly_limit: number | null; // null = unlimited
    rate_limit_per_minute: number | null; // null = unlimited
  };
  price_monthly_usd: number;
  features: string[];
}

/**
 * Pricing tiers configuration
 * 
 * These are NOT stored in the database
 * Used for reference when manually assigning tiers to projects
 */
export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'free',
    name: 'Free',
    limits: {
      monthly_limit: 1000,
      rate_limit_per_minute: 10,
    },
    price_monthly_usd: 0,
    features: [
      'Email only',
      'Basic support',
      '3 retry attempts',
      'API access',
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    limits: {
      monthly_limit: 10000,
      rate_limit_per_minute: 100,
    },
    price_monthly_usd: 29,
    features: [
      'Email + SMS',
      'Priority support',
      'Advanced analytics',
      'Idempotency keys',
      'Event webhooks',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    limits: {
      monthly_limit: 1000000,
      rate_limit_per_minute: 1000,
    },
    price_monthly_usd: 299,
    features: [
      'All channels (Email, SMS, WhatsApp, Push)',
      '24/7 support',
      '99.9% SLA',
      'Dedicated success manager',
      'Custom integrations',
      'Volume discounts',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    limits: {
      monthly_limit: null, // unlimited
      rate_limit_per_minute: null, // unlimited
    },
    price_monthly_usd: 0, // Custom pricing
    features: [
      'Everything in Pro',
      'Unlimited volume',
      'Custom SLA',
      'On-premise deployment option',
      'Dedicated infrastructure',
      'White-label solution',
    ],
  },
];

/**
 * Get tier by ID
 */
export function getTierById(tierId: string): PricingTier | null {
  return PRICING_TIERS.find((tier) => tier.id === tierId) || null;
}

/**
 * Get all tiers
 */
export function getAllTiers(): PricingTier[] {
  return PRICING_TIERS;
}
