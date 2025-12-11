import { supabase } from './supabase';

export interface CategoryRule {
  id?: string;
  merchant_pattern: string;
  category_id: string;
  confidence: number;
  created_at?: string;
  updated_at?: string;
}

// Extract a normalized "merchant signature" from transaction descriptions
// This helps match future transactions from the same merchant
export function extractMerchantSignature(description: string): string {
  return description
    .toLowerCase()
    // Remove common bank prefixes
    .replace(/purchase authorized on \d{2}\/\d{2}\s*/gi, '')
    .replace(/pos purchase\s*/gi, '')
    .replace(/debit card purchase\s*/gi, '')
    .replace(/checkcard\s*/gi, '')
    .replace(/visa\s*/gi, '')
    .replace(/mastercard\s*/gi, '')
    // Remove card/reference numbers (4+ digits)
    .replace(/\d{4,}/g, '')
    // Remove store numbers like "#1234" or "STORE 1234"
    .replace(/\s*#\s*\d+/g, '')
    .replace(/\s+store\s+\d+/gi, '')
    // Remove trailing numbers and dates
    .replace(/\s+\d+$/g, '')
    .replace(/\d{1,2}\/\d{1,2}/g, '')
    // Remove city/state info often at end
    .replace(/\s+[a-z]{2}\s*$/i, '')
    // Keep only letters and spaces
    .replace(/[^a-z\s]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim()
    // Take first 4 words as merchant identifier (usually enough to identify)
    .split(/\s+/)
    .slice(0, 4)
    .join(' ')
    .trim();
}

// Get display-friendly version of merchant pattern
export function formatMerchantPattern(pattern: string): string {
  return pattern
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

class CategorizationService {
  private userRules: Map<string, CategoryRule> = new Map();
  private rulesLoaded = false;
  private currentUserId: string | null = null;
  private currentSessionId: string | null = null;

  // Load user's learned rules from database
  async loadUserRules(userId?: string, sessionId?: string): Promise<void> {
    this.currentUserId = userId || null;
    this.currentSessionId = sessionId || null;

    try {
      let query = supabase
        .from('category_rules')
        .select('*')
        .order('confidence', { ascending: false });
      
      if (userId) {
        query = query.eq('user_id', userId);
      } else if (sessionId) {
        query = query.eq('session_id', sessionId);
      } else {
        // No user or session, can't load rules
        this.userRules.clear();
        this.rulesLoaded = true;
        return;
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('Error loading category rules:', error);
        return;
      }

      this.userRules.clear();
      if (data) {
        data.forEach(rule => {
          this.userRules.set(rule.merchant_pattern, rule);
        });
        console.log(`Loaded ${data.length} category rules`);
      }
    } catch (error) {
      console.error('Failed to load category rules:', error);
    }
    
    this.rulesLoaded = true;
  }

  // Get all rules (for display in settings)
  getRules(): CategoryRule[] {
    return Array.from(this.userRules.values()).sort((a, b) => 
      a.merchant_pattern.localeCompare(b.merchant_pattern)
    );
  }

  // Check if a rule exists for a merchant
  hasRule(description: string): boolean {
    const signature = extractMerchantSignature(description);
    return this.userRules.has(signature);
  }

  // Get the learned category for a description, if any
  getLearnedCategory(description: string): string | null {
    if (!this.rulesLoaded) return null;
    
    const signature = extractMerchantSignature(description);
    
    // 1. Exact match
    const exactMatch = this.userRules.get(signature);
    if (exactMatch && exactMatch.confidence >= 0.5) {
      return exactMatch.category_id;
    }

    // 2. Partial match - check if signature contains or is contained by a rule
    for (const [pattern, rule] of this.userRules) {
      if (rule.confidence < 0.5) continue;
      
      // Check if the signature contains the pattern (or vice versa)
      if (signature.includes(pattern) || pattern.includes(signature)) {
        // Only match if there's significant overlap
        const shorter = signature.length < pattern.length ? signature : pattern;
        const longer = signature.length >= pattern.length ? signature : pattern;
        if (shorter.length >= 3 && longer.includes(shorter)) {
          return rule.category_id;
        }
      }
    }

    return null;
  }

  // Learn from user correction
  async learnFromCorrection(
    description: string,
    newCategoryId: string
  ): Promise<{ success: boolean; merchantPattern: string }> {
    const signature = extractMerchantSignature(description);
    
    if (!signature || signature.length < 2) {
      return { success: false, merchantPattern: '' };
    }

    const existingRule = this.userRules.get(signature);
    const newConfidence = existingRule 
      ? Math.min(1.0, existingRule.confidence + 0.2) // Boost confidence with each correction
      : 1.0;

    try {
      const ruleData: any = {
        merchant_pattern: signature,
        category_id: newCategoryId,
        confidence: newConfidence,
        updated_at: new Date().toISOString()
      };

      if (this.currentUserId) {
        ruleData.user_id = this.currentUserId;
        ruleData.session_id = null;
      } else if (this.currentSessionId) {
        ruleData.user_id = null;
        ruleData.session_id = this.currentSessionId;
      } else {
        return { success: false, merchantPattern: signature };
      }

      // Upsert the rule
      const { error } = await supabase
        .from('category_rules')
        .upsert(ruleData, {
          onConflict: this.currentUserId ? 'user_id,merchant_pattern' : 'session_id,merchant_pattern'
        });

      if (error) {
        console.error('Error saving category rule:', error);
        return { success: false, merchantPattern: signature };
      }

      // Update local cache
      this.userRules.set(signature, {
        merchant_pattern: signature,
        category_id: newCategoryId,
        confidence: newConfidence
      });

      console.log(`Learned: "${signature}" → ${newCategoryId}`);
      return { success: true, merchantPattern: signature };
    } catch (error) {
      console.error('Failed to save category rule:', error);
      return { success: false, merchantPattern: signature };
    }
  }

  // Delete a rule
  async deleteRule(merchantPattern: string): Promise<boolean> {
    try {
      let query = supabase
        .from('category_rules')
        .delete()
        .eq('merchant_pattern', merchantPattern);

      if (this.currentUserId) {
        query = query.eq('user_id', this.currentUserId);
      } else if (this.currentSessionId) {
        query = query.eq('session_id', this.currentSessionId);
      }

      const { error } = await query;

      if (error) {
        console.error('Error deleting rule:', error);
        return false;
      }

      this.userRules.delete(merchantPattern);
      console.log(`Deleted rule: "${merchantPattern}"`);
      return true;
    } catch (error) {
      console.error('Failed to delete rule:', error);
      return false;
    }
  }

  // Clear all rules for current user/session
  async clearAllRules(): Promise<boolean> {
    try {
      let query = supabase
        .from('category_rules')
        .delete();

      if (this.currentUserId) {
        query = query.eq('user_id', this.currentUserId);
      } else if (this.currentSessionId) {
        query = query.eq('session_id', this.currentSessionId);
      }

      const { error } = await query;

      if (error) {
        console.error('Error clearing rules:', error);
        return false;
      }

      this.userRules.clear();
      return true;
    } catch (error) {
      console.error('Failed to clear rules:', error);
      return false;
    }
  }

  // Check if rules are loaded
  isReady(): boolean {
    return this.rulesLoaded;
  }

  // Get count of rules
  getRuleCount(): number {
    return this.userRules.size;
  }
}

export const categorizationService = new CategorizationService();




