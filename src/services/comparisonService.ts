import { supabase, Comparison, UsageLog } from '../lib/supabase'

export class ComparisonService {
  // Save a new comparison
  static async saveComparison(
    userId: string,
    statement1Name: string,
    statement2Name: string,
    statement1Data: any,
    statement2Data: any,
    comparisonResults: any,
    categories: string[],
    totalWithdrawals: number,
    totalDeposits: number
  ): Promise<Comparison> {
    const { data, error } = await supabase
      .from('comparisons')
      .insert({
        user_id: userId,
        statement1_name: statement1Name,
        statement2_name: statement2Name,
        statement1_data: statement1Data,
        statement2_data: statement2Data,
        comparison_results: comparisonResults,
        categories,
        total_withdrawals: totalWithdrawals,
        total_deposits: totalDeposits,
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  // Get user's comparison history
  static async getUserComparisons(userId: string): Promise<Comparison[]> {
    const { data, error } = await supabase
      .from('comparisons')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  }

  // Get a specific comparison by ID
  static async getComparison(id: string): Promise<Comparison | null> {
    const { data, error } = await supabase
      .from('comparisons')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  }

  // Log usage for credit tracking
  static async logUsage(
    userId: string,
    action: 'pdf_upload' | 'csv_export' | 'pdf_export',
    creditsUsed: number,
    description: string
  ): Promise<UsageLog> {
    const { data, error } = await supabase
      .from('usage_logs')
      .insert({
        user_id: userId,
        action,
        credits_used: creditsUsed,
        description,
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  // Get user's usage history
  static async getUserUsage(userId: string): Promise<UsageLog[]> {
    const { data, error } = await supabase
      .from('usage_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  }

  // Update user credits
  static async updateUserCredits(userId: string, credits: number): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({ credits })
      .eq('id', userId)

    if (error) throw error
  }

  // Get user profile
  static async getUserProfile(userId: string): Promise<any> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) throw error
    return data
  }

  // Create or update user profile
  static async upsertUserProfile(userId: string, profile: any): Promise<void> {
    const { error } = await supabase
      .from('users')
      .upsert({
        id: userId,
        ...profile,
      })

    if (error) throw error
  }
} 