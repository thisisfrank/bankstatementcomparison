import { supabase, Profile, UsageLog, TIER_CONFIG } from './supabase'

export class UserService {
  private static instance: UserService
  private currentUser: Profile | null = null
  private sessionId: string | null = null

  static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService()
    }
    return UserService.instance
  }

  // Generate a session ID for anonymous users
  private generateSessionId(): string {
    return 'session_' + Math.random().toString(36).substr(2, 9)
  }

  // Sanitize session ID before storing
  private sanitizeSessionId(sessionId: string): string {
    return sessionId.replace(/[^a-zA-Z0-9_-]/g, '')
  }

  // Validate session ID format
  private isValidSessionId(sessionId: string): boolean {
    return /^session_[a-zA-Z0-9]{9}$/.test(sessionId)
  }

  // Get or create session ID for anonymous users (persistent across refreshes)
  getSessionId(): string {
    if (!this.sessionId) {
      // Try to get existing session from localStorage
      const storedSessionId = localStorage.getItem('anonymous_session_id')
      
      if (storedSessionId && this.isValidSessionId(storedSessionId)) {
        this.sessionId = storedSessionId
      } else {
        // Generate new session ID and store it
        this.sessionId = this.sanitizeSessionId(this.generateSessionId())
        localStorage.setItem('anonymous_session_id', this.sessionId)
      }
    }
    return this.sessionId
  }

  // Clear anonymous session (for testing or when user signs up)
  clearAnonymousSession(): void {
    localStorage.removeItem('anonymous_session_id')
    this.sessionId = null
  }

  // Sign in with email/password
  async signIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) throw error

      if (data.user) {
        await this.loadUserProfile(data.user.id)
        return { success: true }
      }

      return { success: false, error: 'Sign in failed' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // Sign up with email/password
  async signUp(email: string, password: string, fullName: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      })

      if (error) throw error

      if (data.user) {
        // Clear anonymous session when user signs up
        this.clearAnonymousSession()
        // Create user profile
        await this.createUserProfile(data.user.id, fullName)
        await this.loadUserProfile(data.user.id)
        return { success: true }
      }

      return { success: false, error: 'Sign up failed' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // Create user profile
  private async createUserProfile(userId: string, fullName: string): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        full_name: fullName,
        tier: 'signup',
        credits: TIER_CONFIG.signup.credits
      })

    if (error) {
      console.error('Error creating user profile:', error)
    }
  }

  // Load user profile
  private async loadUserProfile(userId: string): Promise<void> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Error loading user profile:', error)
      this.currentUser = null
    } else {
      this.currentUser = data
    }
  }

  // Get current user profile
  async getCurrentUser(): Promise<Profile | null> {
    if (this.currentUser) {
      return this.currentUser
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await this.loadUserProfile(user.id)
      return this.currentUser
    }

    return null
  }

  // Check if user can perform action based on tier
  async canPerformAction(action: 'comparison' | 'page_processed', pagesRequired: number = 1): Promise<{
    canPerform: boolean
    reason?: string
    tier: string
    creditsUsed: number
    creditsLimit: number
  }> {
    const user = await this.getCurrentUser()
    const sessionId = this.getSessionId()

    if (user) {
      // Authenticated user
      const tierConfig = TIER_CONFIG[user.tier]
      const canPerform = user.credits >= pagesRequired

      return {
        canPerform,
        reason: canPerform ? undefined : `You need ${pagesRequired} credits but only have ${user.credits} available`,
        tier: user.tier,
        creditsUsed: user.credits,
        creditsLimit: tierConfig.credits
      }
    } else {
      // Anonymous user - check actual usage from logs
      const tierConfig = TIER_CONFIG.anonymous
      const usageHistory = await this.getUsageHistory()
      const totalUsed = usageHistory.reduce((sum, log) => sum + log.credits_used, 0)
      const remainingCredits = tierConfig.credits - totalUsed
      const canPerform = pagesRequired <= remainingCredits

      return {
        canPerform,
        reason: canPerform ? undefined : `Anonymous users are limited to ${tierConfig.credits} credits per month`,
        tier: 'anonymous',
        creditsUsed: totalUsed,
        creditsLimit: tierConfig.credits
      }
    }
  }

  // Log usage
  async logUsage(action: 'comparison' | 'page_processed', pagesProcessed: number): Promise<void> {
    const user = await this.getCurrentUser()
    const sessionId = this.getSessionId()

    // Log the usage
    const { error: logError } = await supabase
      .from('usage_logs')
      .insert({
        user_id: user?.id || null,
        session_id: user ? null : sessionId,
        action,
        pages_processed: pagesProcessed,
        credits_used: pagesProcessed
      })

    if (logError) {
      console.error('Error logging usage:', logError)
    }

    // Update user profile if authenticated
    if (user) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          credits: user.credits - pagesProcessed
        })
        .eq('id', user.id)

      if (updateError) {
        console.error('Error updating user profile:', updateError)
      } else {
        // Update local state
        this.currentUser = {
          ...user,
          credits: user.credits - pagesProcessed
        }
      }
    }
    // For anonymous users, the usage is tracked in the usage_logs table
    // and will be calculated when needed via getUsageHistory()
  }

  // Get usage history
  async getUsageHistory(): Promise<UsageLog[]> {
    const user = await this.getCurrentUser()
    const sessionId = this.getSessionId()

    const { data, error } = await supabase
      .from('usage_logs')
      .select('*')
      .eq(user ? 'user_id' : 'session_id', user?.id || sessionId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Error fetching usage history:', error)
      return []
    }

    return data || []
  }

  // Sign out
  async signOut(): Promise<void> {
    await supabase.auth.signOut()
    this.currentUser = null
    this.sessionId = null
    // Clear anonymous session when user signs out
    this.clearAnonymousSession()
  }

  // Update user tier and credits after successful payment
  async updateUserTierAndCredits(tier: Profile['tier'], credits: number): Promise<void> {
    const user = await this.getCurrentUser()
    if (!user) return

    const { error } = await supabase
      .from('profiles')
      .update({ 
        tier,
        credits: credits
      })
      .eq('id', user.id)

    if (error) {
      console.error('Error updating user tier and credits:', error)
    } else {
      this.currentUser = { ...user, tier, credits }
    }
  }

  // Update user tier (for testing)
  async updateUserTier(tier: Profile['tier']): Promise<void> {
    const user = await this.getCurrentUser()
    if (!user) return

    const { error } = await supabase
      .from('profiles')
      .update({ tier })
      .eq('id', user.id)

    if (error) {
      console.error('Error updating user tier:', error)
    } else {
      this.currentUser = { ...user, tier }
    }
  }

  // Reset user account (for testing)
  async resetUserAccount(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      // First, try to sign up the user if they don't exist
      const { data, error } = await supabase.auth.signUp({
        email,
        password: 'testpassword123',
        options: {
          data: {
            full_name: 'Frank Gonzalez'
          }
        }
      })

      if (error) {
        // If user already exists, try to sign in
        const signInResult = await supabase.auth.signInWithPassword({
          email,
          password: 'testpassword123'
        })

        if (signInResult.error) {
          return { success: false, error: 'Could not create or sign in user' }
        }
      }

      // Create or update user profile
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            full_name: 'Frank Gonzalez',
            tier: 'anonymous',
            credits: TIER_CONFIG.anonymous.credits
          })

        if (profileError) {
          console.error('Error creating profile:', profileError)
        }

        // Load the user profile
        await this.loadUserProfile(user.id)
        return { success: true }
      }

      return { success: false, error: 'User creation failed' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }
}

export const userService = UserService.getInstance() 