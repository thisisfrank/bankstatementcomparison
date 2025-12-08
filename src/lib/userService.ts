import { supabase, Profile, UsageLog, TIER_CONFIG, setSessionContext } from './supabase'

export class UserService {
  private static instance: UserService
  private currentUser: Profile | null = null
  private sessionId: string | null = null
  private sessionContextSet: boolean = false

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

  // Ensure session context is set for anonymous database operations
  // This sets the session_id in PostgreSQL so RLS policies can validate it
  async ensureSessionContext(): Promise<void> {
    // Only needed for anonymous users
    const user = await this.getCurrentUser()
    if (user) {
      // Authenticated users don't need session context
      return
    }

    // Set the session context if not already set in this session
    if (!this.sessionContextSet) {
      const sessionId = this.getSessionId()
      await setSessionContext(sessionId)
      this.sessionContextSet = true
    }
  }

  // Force refresh session context (call after session changes)
  async refreshSessionContext(): Promise<void> {
    this.sessionContextSet = false
    await this.ensureSessionContext()
  }

  // Clear anonymous session (for testing or when user signs up)
  clearAnonymousSession(): void {
    localStorage.removeItem('anonymous_session_id')
    this.sessionId = null
    this.sessionContextSet = false
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
        
        // Check if user needs email confirmation
        if (data.session) {
          // User is immediately authenticated (no email confirmation required)
          return { success: true }
        } else {
          // User needs to confirm email
          return { success: false, error: 'Please check your email to confirm your account before proceeding.' }
        }
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
    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database timeout')), 5000)
      );
      
      const dbPromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      const { data, error } = await Promise.race([dbPromise, timeoutPromise]) as any;

      if (error) {
        console.error('Error loading user profile:', error);
        // Create a minimal user profile if database fails
        this.currentUser = {
          id: userId,
          tier: 'signup' as const,
          credits: 10,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      } else {
        this.currentUser = data;
      }
    } catch (error) {
      console.error('Database connection failed:', error);
      // Create a minimal user profile if database connection fails
      this.currentUser = {
        id: userId,
        tier: 'signup' as const,
        credits: 10,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }
  }

  // Get current user profile
  async getCurrentUser(): Promise<Profile | null> {
    console.log('🔍 getCurrentUser: Starting...');
    try {
      // Check for valid session instead of cached user data
      console.log('🔍 getCurrentUser: Calling supabase.auth.getSession()...');
      
      const getSessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise<any>((_, reject) => 
        setTimeout(() => reject(new Error('getSession timeout after 10 seconds')), 10000)
      );
      
      const { data: { session } } = await Promise.race([getSessionPromise, timeoutPromise]);
      console.log('🔍 getCurrentUser: Got session:', session ? 'exists' : 'null');
      
      if (session?.user) {
        console.log('🔍 getCurrentUser: User found in session:', session.user.email);
        // If we have a cached user with the same ID, return it
        if (this.currentUser && this.currentUser.id === session.user.id) {
          console.log('🔍 getCurrentUser: Returning cached user');
          return this.currentUser
        }
        // Otherwise load fresh profile
        console.log('🔍 getCurrentUser: Loading fresh profile...');
        await this.loadUserProfile(session.user.id)
        console.log('🔍 getCurrentUser: Profile loaded, returning');
        return this.currentUser
      }

      // No valid session, clear any cached data
      console.log('🔍 getCurrentUser: No session, returning null');
      this.currentUser = null
      return null
    } catch (error) {
      console.error('❌ getCurrentUser: Error:', error);
      this.currentUser = null;
      return null;
    }
  }

  // Debug function to check authentication status
  async debugAuthStatus(): Promise<{ isAuthenticated: boolean; userId?: string; error?: string }> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error) {
        return { isAuthenticated: false, error: error.message }
      }
      
      if (session?.user) {
        return { isAuthenticated: true, userId: session.user.id }
      }
      
      return { isAuthenticated: false }
    } catch (error: any) {
      return { isAuthenticated: false, error: error.message }
    }
  }

  // Check if user can perform action based on tier
  async canPerformAction(action: 'comparison' | 'page_processed', pagesRequired: number = 1): Promise<{
    canPerform: boolean
    reason?: string
    tier: string
    creditsUsed: number
    creditsLimit: number
  }> {
    console.log('🔍 canPerformAction called with:', { action, pagesRequired });
    try {
      console.log('🔍 Getting current user...');
      const user = await this.getCurrentUser()
      console.log('🔍 Current user:', user ? `authenticated (${user.email})` : 'anonymous');
      
      const sessionId = this.getSessionId()
      console.log('🔍 Session ID:', sessionId);

      if (user) {
        console.log('🔍 Processing as authenticated user...');
        // Authenticated user
        const tierConfig = TIER_CONFIG[user.tier] || TIER_CONFIG.signup
        
        // If user.credits is undefined (DB schema not updated), default to tier limit
        const userCredits = user.credits ?? tierConfig.credits
        const canPerform = userCredits >= pagesRequired

        const result = {
          canPerform,
          reason: canPerform ? undefined : `You need ${pagesRequired} credits but only have ${userCredits} available`,
          tier: user.tier || 'signup',
          creditsUsed: userCredits,
          creditsLimit: tierConfig.credits
        };
        console.log('🔍 Authenticated result:', result);
        return result;
      } else {
        console.log('🔍 Processing as anonymous user...');
        // Anonymous user - allow with generous limits, skip database check to avoid hanging
        const tierConfig = TIER_CONFIG.anonymous
        
        // For anonymous users, we'll be permissive and allow reasonable usage
        // The actual usage tracking will happen in logUsage() after the comparison
        const canPerform = pagesRequired <= 100 // Generous limit for anonymous users
        
        const result = {
          canPerform,
          reason: canPerform ? undefined : `Anonymous users are limited to ${tierConfig.credits} pages per comparison`,
          tier: 'anonymous',
          creditsUsed: 0,
          creditsLimit: tierConfig.credits
        };
        console.log('🔍 Anonymous result:', result);
        return result;
      }
    } catch (error) {
      console.error('❌ Error in canPerformAction:', error);
      // If anything fails, be permissive and allow the action
      const fallbackResult = {
        canPerform: true,
        tier: 'anonymous',
        creditsUsed: 0,
        creditsLimit: 100
      };
      console.log('🔍 Fallback result:', fallbackResult);
      return fallbackResult;
    }
  }

  // Log usage
  async logUsage(action: 'comparison' | 'page_processed', pagesProcessed: number): Promise<void> {
    const user = await this.getCurrentUser()
    const sessionId = this.getSessionId()

    // Ensure session context is set for anonymous users before database operations
    if (!user) {
      await this.ensureSessionContext()
    }

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
    if (user && user.credits !== undefined) {
      // Only update credits if the field exists in the user profile
      const newCredits = Math.max(0, user.credits - pagesProcessed)
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          credits: newCredits
        })
        .eq('id', user.id)

      if (updateError) {
        console.error('Error updating user profile:', updateError)
      } else {
        // Update local state
        this.currentUser = {
          ...user,
          credits: newCredits
        }
      }
    }
    // For anonymous users, the usage is tracked in the usage_logs table
    // and will be calculated when needed via getUsageHistory()
  }

  // Get usage history
  async getUsageHistory(): Promise<UsageLog[]> {
    try {
      const user = await this.getCurrentUser()
      const sessionId = this.getSessionId()

      // Ensure session context is set for anonymous users before database operations
      if (!user) {
        await this.ensureSessionContext()
      }

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database timeout')), 5000)
      );
      
      const dbPromise = supabase
        .from('usage_logs')
        .select('*')
        .eq(user ? 'user_id' : 'session_id', user?.id || sessionId)
        .order('created_at', { ascending: false })
        .limit(50);

      const { data, error } = await Promise.race([dbPromise, timeoutPromise]) as any;

      if (error) {
        console.error('Error fetching usage history:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Database connection failed for usage history:', error);
      return [];
    }
  }

  // Sign out
  async signOut(): Promise<void> {
    console.log('🔍 signOut: Starting...');
    
    // Clear all local state first
    this.currentUser = null;
    this.sessionId = null;
    this.sessionContextSet = false;
    this.clearAnonymousSession();
    console.log('🔍 signOut: Local state cleared');
    
    try {
      // Sign out from Supabase with global scope to clear all sessions
      console.log('🔍 signOut: Calling supabase.auth.signOut()...');
      
      const signOutPromise = supabase.auth.signOut({ scope: 'global' });
      const timeoutPromise = new Promise<any>((_, reject) => 
        setTimeout(() => reject(new Error('Sign out timeout after 3 seconds')), 3000)
      );
      
      const { error } = await Promise.race([signOutPromise, timeoutPromise]);
      
      if (error) {
        console.error('❌ signOut: Error during signOut:', error);
        // Don't throw - we already cleared local state
        return;
      }
      console.log('✅ signOut: Successfully signed out from Supabase');
    } catch (error) {
      console.error('❌ signOut: Exception during signOut:', error);
      // Don't throw - we already cleared local state, which is the important part
      console.log('⚠️ signOut: Continuing despite error (local state already cleared)');
    }
    
    console.log('✅ signOut: Complete - auth listener will handle state updates');
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