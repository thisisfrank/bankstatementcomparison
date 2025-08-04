import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types for our database
export interface Profile {
  id: string
  full_name?: string
  tier: 'anonymous' | 'signup' | 'starter' | 'pro' | 'business'
  credits: number
  created_at: string
  updated_at: string
}

export interface UsageLog {
  id: string
  user_id?: string
  session_id?: string
  action: 'comparison' | 'page_processed' | 'credit_purchase'
  pages_processed: number
  credits_used: number
  created_at: string
}

// Tier configurations
export const TIER_CONFIG = {
  anonymous: {
    name: 'Anonymous',
    price: 'Free',
    credits: 20,
    description: '20 pages per month, No signup required'
  },
  signup: {
    name: 'Sign Up',
    price: 'Free',
    credits: 40,
    description: '40 pages per month, Sign up for free'
  },
  starter: {
    name: 'Starter',
    price: '$29/month',
    credits: 150,
    description: '150 pages per month, Perfect for individuals'
  },
  pro: {
    name: 'Pro',
    price: '$69/month',
    credits: 400,
    description: '400 pages per month, Great for small teams'
  },
  business: {
    name: 'Business',
    price: '$149/month',
    credits: 1000,
    description: '1,000 pages per month, Enterprise solution'
  }
} as const 