import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types
export interface User {
  id: string
  email: string
  credits: number
  subscription_tier: 'free' | 'starter' | 'pro' | 'business'
  created_at: string
  updated_at: string
}

export interface Comparison {
  id: string
  user_id: string
  statement1_name: string
  statement2_name: string
  statement1_data: any
  statement2_data: any
  comparison_results: any
  categories: string[]
  total_withdrawals: number
  total_deposits: number
  created_at: string
}

export interface UsageLog {
  id: string
  user_id: string
  action: 'pdf_upload' | 'csv_export' | 'pdf_export'
  credits_used: number
  description: string
  created_at: string
} 