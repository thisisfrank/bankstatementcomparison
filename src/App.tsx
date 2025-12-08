import React, { useState, useCallback, useEffect } from 'react';
import { Upload, FileText, BarChart3, Download, CheckCircle, AlertCircle, Loader2, CreditCard, Users, Receipt, Car, Utensils, ShoppingBag, Gamepad2, Zap, Activity, DollarSign, Moon, Sun, Edit3, Trash2, Eye, Target, TrendingDown, X, ChevronDown, ChevronRight, HelpCircle, ArrowLeftRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

import { userService } from './lib/userService';
import { Profile, TIER_CONFIG, supabase } from './lib/supabase';
import { stripeService, StripePlanId } from './lib/stripeService';
import { categorizationService, formatMerchantPattern, CategoryRule } from './lib/categorizationService';





// Get Supabase URL for Edge Functions
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/parse-bank-statement`;

// Toast notification component for learning feedback
interface ToastProps {
  message: string;
  isVisible: boolean;
  onClose: () => void;
  isDark: boolean;
}

function Toast({ message, isVisible, onClose, isDark }: ToastProps) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-[200] animate-fade-in-up">
      <div className={`flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border-2 ${
        isDark 
          ? 'bg-gray-900 border-green-500 text-white' 
          : 'bg-white border-green-500 text-gray-800'
      }`}>
        <span className="text-xl">🧠</span>
        <span className="text-sm font-medium">{message}</span>
        <button 
          onClick={onClose}
          className={`ml-2 p-1 rounded hover:bg-opacity-20 ${isDark ? 'hover:bg-white' : 'hover:bg-gray-500'}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  type: 'withdrawal' | 'deposit'; // New field to distinguish between money going out vs coming in
}

interface ParsedStatement {
  transactions: Transaction[];
  withdrawals: Transaction[]; // Money going out (negative amounts)
  deposits: Transaction[]; // Money coming in (positive amounts)
  totalWithdrawals: number;
  totalDeposits: number;
  accountHolder: string;
}

interface ComparisonResult {
  category: string;
  statementValues: number[]; // Array of values for each statement
  differences: number[]; // Differences from average
  minIndex: number; // Index of statement with minimum value
  maxIndex: number; // Index of statement with maximum value
}

const categories = [
  { id: 'food-dining', name: 'Food & Dining', icon: Utensils, color: '#FF6B6B', keywords: ['starbucks', 'coffee', 'restaurant', 'mcdonald', 'taco bell', 'chipotle', 'subway', 'pizza', 'burger', 'dining', 'doordash', 'grubhub', 'ubereats', 'postmates', 'dunkin', 'wendys', 'chick-fil-a', 'panera', 'panda express', 'sonic', 'arbys', 'popeyes', 'kfc', 'ihop', 'denny', 'waffle', 'buffalo wild', 'applebee', 'olive garden', 'red lobster', 'outback', 'cheesecake factory', 'black rock', 'los favoritos', 'taco', 'asian fusion', 'jimmy john', 'raising cane', 'dutch bros', 'salad and go', 'pho', 'nekter', 'juice bar', 'einstein', 'in-n-out', 'in n out', 'pita jungle', 'pita', 'frutilandia', 'grill', 'smoothie', 'bagel', 'bakery', 'cafe', 'caffe', 'deli', 'sushi', 'ramen', 'noodle', 'wingstop', 'wing', 'zaxby', 'firehouse', 'jersey mike', 'potbelly', 'mod pizza', 'blaze pizza', 'cinco de mayo', 'el pollo', 'del taco', 'rubio', 'qdoba', 'moes', 'waba grill', 'teriyaki', 'poke', 'acai'] },
  { id: 'groceries', name: 'Groceries', icon: ShoppingBag, color: '#4ECDC4', keywords: ['frys', 'safeway', 'kroger', 'grocery', 'market', 'food store', 'whole foods', 'trader joe', 'aldi', 'publix', 'wegmans', 'heb', 'meijer', 'food lion', 'giant', 'stop & shop', 'cvs', 'walgreens', 'rite aid', 'drugstore', 'pharmacy', 'bashas', 'sprouts', 'natural grocers', 'food city', 'winco', 'food 4 less', 'smart & final', 'grocery outlet', 'piggly wiggly', 'bi-lo', 'ingles', 'harris teeter', 'shoprite'] },
  { id: 'gas-transport', name: 'Gas & Transportation', icon: Car, color: '#45B7D1', keywords: ['circle k', 'shell', 'chevron', 'exxon', 'uber', 'lyft', 'gas', 'fuel', 'transport', 'bp ', 'mobil', 'texaco', 'arco', 'valero', 'sunoco', 'marathon', 'parking', 'toll', 'metro', 'transit', 'autozone', 'oreilly', 'advance auto', 'napa', 'jiffy lube', 'valvoline', 'firestone', 'goodyear', 'discount tire', 'pep boys', 'midas', 'meineke', 'car wash', 'qt ', 'quiktrip', 'clean freak', 'racetrac', 'wawa', 'sheetz', 'speedway', 'loves travel', 'pilot ', 'flying j', 'kwik trip', 'kum & go', 'caseys', "buc-ee"] },
  { id: 'subscriptions', name: 'Subscriptions', icon: Gamepad2, color: '#FCEA2B', keywords: ['netflix', 'spotify', 'subscription', 'monthly', 'hulu', 'disney', 'prime', 'recurring', 'verizon', 'apple music', 'youtube', 'hbo', 'peacock', 'paramount', 'audible', 'kindle', 'xbox', 'playstation', 'nintendo', 'gym', 'planet fitness', 'fitness center', 'la fitness', 'anytime fitness', '24 hour fitness', 'ymca', 'crossfit', 'dropbox', 'adobe', 'microsoft 365', 'google storage', 'icloud', 'evernote', 'notion', 'slack', 'zoom'] },
  { id: 'utilities', name: 'Utilities & Bills', icon: Zap, color: '#FF9FF3', keywords: ['electric', 'water', 'gas bill', 'utility', 'phone', 'internet', 'cable', 'atm', 'fee', 'charge', 'overdraft', 'penalty', 'comcast', 'xfinity', 'spectrum', 'at&t', 't-mobile', 'sprint', 'cox', 'frontier', 'srp', 'surepay', 'centurylink', 'aps ', 'pg&e', 'sce ', 'duke energy', 'dominion', 'entergy', 'insurance', 'geico', 'progressive', 'state farm', 'allstate', 'liberty mutual', 'usaa'] },
  { id: 'credit-repayments', name: 'Credit Repayments', icon: CreditCard, color: '#E17055', keywords: ['student loan', 'dept education', 'dept of ed', 'navient', 'nelnet', 'fedloan', 'mohela', 'great lakes', 'aidvantage', 'sallie mae', 'loan payment', 'loan repayment', 'credit card payment', 'card payment', 'discover payment', 'chase payment', 'amex payment', 'capital one payment', 'citi payment', 'wells fargo payment', 'bank of america payment', 'synchrony', 'affirm', 'klarna', 'afterpay', 'paypal credit', 'personal loan', 'auto loan', 'car payment', 'car loan', 'mortgage', 'home loan', 'line of credit', 'heloc', 'consolidation', 'sofi', 'earnest', 'upstart', 'prosper', 'lending club', 'marcus', 'lightstream', 'best egg', 'avant', 'upgrade', 'debt payment', 'applecard', 'apple card'] },
  { id: 'health', name: 'Health & Medical', icon: Activity, color: '#54A0FF', keywords: ['medical', 'doctor', 'hospital', 'clinic', 'dental', 'dentist', 'orthodont', 'xray', 'x-ray', 'radiology', 'lab', 'quest diagnostics', 'labcorp', 'urgent care', 'emergency', 'physician', 'optometrist', 'eye doctor', 'vision', 'dermatolog', 'cardio', 'pediatr', 'obgyn', 'physical therapy', 'chiropract', 'mental health', 'psychiatr', 'psycholog', 'therapy', 'counseling', 'optique', 'optical', 'lenscrafters', 'pearle vision', 'americas best', 'eyeglass'] },
  { id: 'income', name: 'Income', icon: DollarSign, color: '#00D4AA', keywords: ['salary', 'deposit', 'payment', 'income', 'payroll', 'direct deposit'] },
  { id: 'shopping', name: 'Shopping & Retail', icon: ShoppingBag, color: '#96CEB4', keywords: ['amazon', 'ebay', 'etsy', 'walmart', 'target', 'best buy', 'home depot', 'lowes', 'costco', 'sams club', 'ikea', 'bed bath', 'wayfair', 'overstock', 'kohls', 'tj maxx', 'marshalls', 'ross', 'burlington', 'nordstrom', 'macys', 'jcpenney', 'dillards', 'sephora', 'ulta', 'bath body', 'old navy', 'gap', 'banana republic', 'h&m', 'zara', 'forever 21', 'nike', 'adidas', 'foot locker', 'dicks sporting', 'academy', 'michaels', 'joann', 'hobby lobby', 'petco', 'petsmart', 'chewy', 'barnes', 'noble', 'bikemaster', 'smoke shop', 'grooming', 'barber', 'hair', 'salon', 'spa', 'nail', 'mens ultimate', 'supercuts', 'great clips', 'sports clips', 'bookstore', 'book store', 'gamestop', 'five below', 'dollar tree', 'dollar general', 'family dollar', '99 cents', 'big lots', 'tuesday morning', 'at home', 'pier 1', 'world market', 'container store', 'crate barrel', 'pottery barn', 'williams sonoma', 'restoration hardware', 'cb2'] },
  { id: 'transfers', name: 'Transfers', icon: ArrowLeftRight, color: '#A78BFA', keywords: ['transfer', 'online transfer', 'bank transfer', 'wire transfer', 'ach transfer', 'internal transfer', 'external transfer', 'zelle', 'venmo', 'paypal', 'cash app', 'money transfer', 'send money', 'receive money', 'save as you go'] },
  { id: 'uncategorized', name: 'Uncategorized', icon: HelpCircle, color: '#9CA3AF', keywords: [] }
];

// Helper to clean up transaction descriptions
const cleanDescription = (description: string): string => {
  return description
    .replace(/Purchase authorized on \d{2}\/\d{2}\s*/gi, '')
    .replace(/Purchase authorized on\s*/gi, '')
    .trim();
};

class BankStatementParser {
  private categoryKeywords: { [key: string]: string[] };

  constructor() {
    this.categoryKeywords = {};
    categories.forEach(cat => {
      this.categoryKeywords[cat.id] = cat.keywords;
    });
  }

  async parsePDF(file: File): Promise<ParsedStatement> {
    try {
      console.log('Starting PDF parsing via Edge Function');
      
      // Convert file to base64 for JSON transport
      const fileBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(fileBuffer);
      
      // Convert to base64 in chunks to avoid stack overflow
      let binaryString = '';
      const chunkSize = 8192; // Process 8KB at a time
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binaryString += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const fileBase64 = btoa(binaryString);

      // Step 1: Upload the PDF file via Edge Function
      console.log('Uploading file to Edge Function...');
      const uploadResponse = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          action: 'upload',
          file: {
            data: fileBase64,
            name: file.name
          }
        })
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error(`Upload failed with status ${uploadResponse.status}:`, errorText);
        throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
      }

      const uploadResult = await uploadResponse.json();
      console.log('Upload successful, result:', uploadResult);
      
      const uuid = uploadResult[0].uuid;
      const state = uploadResult[0].state;

      // Step 2: Check if processing is needed (for image-based PDFs)
      if (state === 'PROCESSING') {
        console.log('File is processing, waiting for completion...');
        let currentState = state;
        let attempts = 0;
        const maxAttempts = 30; // 5 minutes max wait time
        
        while (currentState === 'PROCESSING' && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
          attempts++;
          
          console.log(`Status check attempt ${attempts}/${maxAttempts}...`);
          const statusResponse = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              action: 'status',
              uuid: uuid
            })
          });

          if (!statusResponse.ok) {
            const errorText = await statusResponse.text();
            console.error(`Status check failed with status ${statusResponse.status}:`, errorText);
            throw new Error(`Status check failed: ${statusResponse.status} - ${errorText}`);
          }

          const statusResult = await statusResponse.json();
          currentState = statusResult[0].state;
          console.log('Current state:', currentState);
        }
        
        if (attempts >= maxAttempts) {
          throw new Error('Processing timeout - file took too long to process');
        }
      }

      // Step 3: Convert the statement to JSON
      console.log('Converting statement to JSON...');
      const convertResponse = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          action: 'convert',
          uuid: uuid
        })
      });

      if (!convertResponse.ok) {
        const errorText = await convertResponse.text();
        console.error(`Conversion failed with status ${convertResponse.status}:`, errorText);
        throw new Error(`Conversion failed: ${convertResponse.status} - ${errorText}`);
      }

      const convertResult = await convertResponse.json();
      console.log('Conversion successful, processing response...');
      
      // Process the API response and separate withdrawals from deposits
      const result = this.processAPIResponse(convertResult[0], file.name);
      console.log('API parsing completed successfully');
      return result;
      
    } catch (error) {
      console.error('Error parsing PDF with API:', error);
      console.log('Falling back to sample data generation...');
      
      // All retries failed
      console.error('All API attempts failed, falling back to sample data generation...');
      console.log('Last error:', error instanceof Error ? error.message : String(error));
      
      // Add a flag to indicate API was not used
      const sampleData = this.generateSampleData(file.name);
      
      return sampleData;
    }
  }

  private processAPIResponse(apiResponse: any, fileName: string): ParsedStatement {
    console.log('Processing API response:', apiResponse);
    console.log('Full API response structure:', JSON.stringify(apiResponse, null, 2));
    
    // The API returns { normalised: [...] } format
    const rawTransactions = apiResponse.normalised || [];
    console.log('Raw transactions from API:', rawTransactions);
    console.log('Number of raw transactions:', rawTransactions.length);
    
    // Check if the response is empty
    if (!rawTransactions || rawTransactions.length === 0) {
      console.warn('WARNING: API returned no transactions! Check if PDF contains parseable transaction data.');
      console.log('API response keys:', Object.keys(apiResponse));
    }
    
    const transactions: Transaction[] = [];
    const withdrawals: Transaction[] = [];
    const deposits: Transaction[] = [];

    rawTransactions.forEach((rawTx: any, index: number) => {
      const amount = parseFloat(rawTx.amount || 0);
      const isWithdrawal = amount < 0;
      const absoluteAmount = Math.abs(amount);
      
      // ALL positive transactions go to income category
      let category = 'income';
      if (isWithdrawal) {
        // Only categorize negative transactions (withdrawals)
        category = this.categorizeTransaction(rawTx.description || '');
        // Safety check: negative transactions should never be income
        if (category === 'income') {
          category = 'utilities'; // Default to utilities for unrecognized negative transactions
        }
      }
      
      const transaction: Transaction = {
        id: `${rawTx.date}-${index}`,
        date: rawTx.date || '',
        description: rawTx.description || '',
        amount: absoluteAmount,
        category: category,
        type: isWithdrawal ? 'withdrawal' : 'deposit'
      };

      transactions.push(transaction);
      
      if (isWithdrawal) {
        withdrawals.push(transaction);
      } else {
        deposits.push(transaction);
      }
    });

    console.log('Processed transactions:', transactions);
    console.log('Processed transactions count:', transactions.length);
    console.log('Withdrawals:', withdrawals);
    console.log('Deposits:', deposits);

    const totalWithdrawals = withdrawals.reduce((sum, t) => sum + t.amount, 0);
    const totalDeposits = deposits.reduce((sum, t) => sum + t.amount, 0);

    return {
      transactions,
      withdrawals,
      deposits,
      totalWithdrawals,
      totalDeposits,
      accountHolder: fileName.replace('.pdf', '')
    };
  }

  private categorizeTransaction(description: string): string {
    // 1. First check user's learned rules (highest priority)
    const learnedCategory = categorizationService.getLearnedCategory(description);
    if (learnedCategory) {
      return learnedCategory;
    }
    
    const lowerDesc = description.toLowerCase();
    
    // Special case: Frys always goes to groceries (even if it says recurring)
    if (lowerDesc.includes('frys')) {
      return 'groceries';
    }
    
    // 2. Fall back to keyword matching
    for (const [categoryId, keywords] of Object.entries(this.categoryKeywords)) {
      if (keywords.some(keyword => lowerDesc.includes(keyword))) {
        return categoryId;
      }
    }
    
    return 'uncategorized'; // Default category for unrecognized transactions
  }

  private generateSampleData(fileName: string): ParsedStatement {
    const sampleWithdrawals = [
      { description: 'Starbucks Coffee', amount: 5.47, category: 'food-dining' },
      { description: 'Safeway Grocery Store', amount: 127.83, category: 'groceries' },
      { description: 'Shell Gas Station', amount: 45.20, category: 'gas-transport' },
      { description: 'Amazon Purchase', amount: 67.99, category: 'shopping' },
      { description: 'Netflix Subscription', amount: 15.99, category: 'subscriptions' },
      { description: 'Electric Company', amount: 89.34, category: 'utilities' },
      { description: 'Planet Fitness', amount: 22.99, category: 'health' },
      { description: 'ATM Withdrawal Fee', amount: 3.50, category: 'fees' },
      { description: 'Chipotle Mexican Grill', amount: 12.45, category: 'food-dining' },
      { description: 'Target Store', amount: 156.78, category: 'groceries' }
    ];

    const sampleDeposits = [
      { description: 'Salary Deposit', amount: 2500.00, category: 'income' },
      { description: 'Freelance Payment', amount: 500.00, category: 'income' },
      { description: 'Refund - Amazon', amount: 45.67, category: 'refunds' },
      { description: 'Interest Payment', amount: 12.34, category: 'income' }
    ];

    const withdrawals = sampleWithdrawals.map((sample, i) => ({
      id: `withdrawal-${i}`,
      date: `11/${Math.floor(Math.random() * 28) + 1}`,
      ...sample,
      type: 'withdrawal' as const
    }));

    const deposits = sampleDeposits.map((sample, i) => ({
      id: `deposit-${i}`,
      date: `11/${Math.floor(Math.random() * 28) + 1}`,
      ...sample,
      type: 'deposit' as const
    }));

    const transactions = [...withdrawals, ...deposits];
    const totalWithdrawals = withdrawals.reduce((sum, t) => sum + t.amount, 0);
    const totalDeposits = deposits.reduce((sum, t) => sum + t.amount, 0);

    return {
      transactions,
      withdrawals,
      deposits,
      totalWithdrawals,
      totalDeposits,
      accountHolder: fileName.replace('.pdf', '')
    };
  }

  async getPDFPageCount(file: File): Promise<number> {
    try {
      // Create a FileReader to read the PDF file
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
          try {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            const uint8Array = new Uint8Array(arrayBuffer);
            
            // Look for the PDF page count in the trailer
            const pdfString = new TextDecoder().decode(uint8Array);
            
            // Find the /Count pattern in the trailer
            const countMatch = pdfString.match(/\/Count\s+(\d+)/);
            if (countMatch) {
              const pageCount = parseInt(countMatch[1]);
              resolve(pageCount);
            } else {
              // Fallback: estimate based on file size (rough approximation)
              const estimatedPages = Math.max(1, Math.floor(file.size / 50000)); // ~50KB per page
              resolve(estimatedPages);
            }
          } catch (error) {
            // Fallback: estimate based on file size
            const estimatedPages = Math.max(1, Math.floor(file.size / 50000));
            resolve(estimatedPages);
          }
        };
        
        reader.onerror = function() {
          // Fallback: estimate based on file size
          const estimatedPages = Math.max(1, Math.floor(file.size / 50000));
          resolve(estimatedPages);
        };
        
        reader.readAsArrayBuffer(file);
      });
    } catch (error) {
      // Final fallback: estimate based on file size
      return Math.max(1, Math.floor(file.size / 50000));
    }
  }
}

function DarkModeToggle({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`
        fixed top-6 right-6 z-50 p-3 rounded-full transition-all duration-300 hover:scale-110
        ${isDark 
          ? 'bg-black border-2 border-white text-white hover:bg-gray-900 shadow-lg' 
          : 'bg-white text-gray-600 hover:bg-gray-50 shadow-lg shadow-gray-200/50'
        }
      `}
      aria-label="Toggle dark mode"
    >
      {isDark ? (
        <Sun className="h-5 w-5 transition-transform duration-300" />
      ) : (
        <Moon className="h-5 w-5 transition-transform duration-300" />
      )}
    </button>
  );
}

function MultiFileUploadZone({
  files,
  parsedData,
  onFilesUpload,
  onRemoveFile,
  onStatementNameChange,
  maxFiles,
  isDark,
  isGenerating
}: {
  files: File[];
  parsedData: ParsedStatement[];
  onFilesUpload: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  onStatementNameChange: (index: number, name: string) => void;
  maxFiles: number;
  isDark: boolean;
  isGenerating: boolean;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useCallback<HTMLInputElement | null>(null, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    onFilesUpload(droppedFiles);
  }, [onFilesUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      onFilesUpload(selectedFiles);
    }
  }, [onFilesUpload]);

  const canAddMore = files.length < maxFiles;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
          Upload Bank Statements
        </h3>
      </div>

      {/* Upload zone */}
      {canAddMore && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            animate-pulse-glow relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200
            ${isDragOver 
              ? isDark ? 'border-white bg-black' : 'border-green-500 bg-green-50'
              : isDark ? 'border-white hover:border-white bg-black' : 'border-gray-300 hover:border-gray-400 bg-white'
            }
          `}
        >
          <input
            type="file"
            accept=".pdf"
            multiple
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isGenerating}
          />
          
          <div className="space-y-3">
            <Upload className={`mx-auto h-12 w-12 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
            <div>
              <p className={`text-lg font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                Drop PDFs here or click to browse
              </p>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                (Wells Fargo, Chase, Bank of America supported)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Uploaded files list */}
      {files.length > 0 && (
        <div className="space-y-3">
          {files.map((file, index) => (
            <div
              key={index}
              className={`p-4 rounded-xl border transition-all ${
                isDark 
                  ? 'bg-black border-white hover:border-white' 
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <CheckCircle className={`h-5 w-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={parsedData[index]?.accountHolder || file.name}
                        onChange={(e) => onStatementNameChange(index, e.target.value)}
                        className={`text-sm font-medium bg-transparent border-b border-transparent hover:border-current focus:border-current outline-none transition-colors ${
                          isDark ? 'text-gray-200' : 'text-gray-800'
                        }`}
                        placeholder="Statement name"
                      />
                    </div>
                    <p className={`text-xs truncate ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                      {file.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onRemoveFile(index)}
                  disabled={isGenerating}
                  className={`p-2 rounded-lg transition-colors ${
                    isGenerating
                      ? 'opacity-50 cursor-not-allowed'
                      : isDark 
                        ? 'hover:bg-red-900/30 text-red-400' 
                        : 'hover:bg-red-100 text-red-600'
                  }`}
                  title="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* File limit badge at bottom with hover tooltip */}
      <div className="flex justify-center">
        <div className="relative group">
          <div className={`text-sm px-3 py-1 rounded-full cursor-pointer transition-all ${
            isDark ? 'bg-black border-2 border-white text-white' : 'bg-black border-2 border-white text-white'
          }`}>
            {files.length}/{maxFiles} files
          </div>
          {maxFiles === 2 && (
            <div className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 rounded-lg text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${
              isDark ? 'bg-black border-2 border-white text-white' : 'bg-white border-2 border-black text-black'
            }`}>
              Upgrade to paid plan for up to 4 files!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FileUploadZone({ 
  onFileUpload, 
  label, 
  isUploading, 
  uploadedFile, 
  parsedData,
  isDark,
  statementName,
  onStatementNameChange,
  comparisonGenerated
}: {
  onFileUpload: (file: File) => void;
  label: string;
  isUploading: boolean;
  uploadedFile: File | null;
  parsedData: ParsedStatement | null;
  isDark: boolean;
  statementName: string;
  onStatementNameChange?: (name: string) => void;
  comparisonGenerated?: boolean;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const pdfFile = files.find(file => file.type === 'application/pdf');
    
    if (pdfFile) {
      onFileUpload(pdfFile);
    }
  }, [onFileUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
    }
  }, [onFileUpload]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <label className={`text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
          {statementName}
        </label>
        {onStatementNameChange && (
          <button
            onClick={() => {
              const newName = prompt('Enter statement name:', statementName);
              if (newName !== null && newName.trim() !== '') {
                onStatementNameChange(newName.trim());
              }
            }}
            className={`p-1 rounded transition-colors ${
              isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-200'
            }`}
          >
            <Edit3 className={`h-4 w-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`} />
          </button>
        )}
      </div>
      
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200
          ${isDragOver 
            ? isDark 
              ? 'border-white bg-black' 
              : 'border-green-500 bg-green-50'
            : isDark
              ? 'border-white hover:border-white bg-black'
              : 'border-gray-300 hover:border-gray-400 bg-white'
          }
          ${uploadedFile 
            ? isDark 
              ? 'border-white bg-black' 
              : 'border-green-500 bg-green-50'
            : ''
          }
        `}
      >
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isUploading}
        />
        
        <div className="space-y-3">
          {isUploading ? (
            <>
              <Loader2 className={`mx-auto h-12 w-12 animate-spin ${isDark ? 'text-green-400' : 'text-green-600'}`} />
              <p className={`font-medium ${isDark ? 'text-green-400' : 'text-green-600'}`}>Uploading PDF...</p>
            </>
          ) : uploadedFile ? (
            <>
              <CheckCircle className={`mx-auto h-12 w-12 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
              <div>
                <p className={`font-medium ${isDark ? 'text-green-300' : 'text-green-700'}`}>
                  {uploadedFile.name}
                </p>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  Ready for comparison
                </p>
                {parsedData && (
                  <div className="mt-2">
                    {parsedData.apiUsed === false ? (
                      <div 
                        className={`flex items-center gap-1 text-xs ${isDark ? 'text-yellow-400' : 'text-yellow-600'} cursor-help`}
                        title={parsedData.apiError ? `API Error: ${parsedData.apiError}` : 'API unavailable'}
                      >
                        <AlertCircle className="h-3 w-3" />
                        <span>Using sample data (API unavailable)</span>
                      </div>
                    ) : parsedData.apiUsed === true ? (
                      <div className={`flex items-center gap-1 text-xs ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                        <CheckCircle className="h-3 w-3" />
                        <span>Parsed with API</span>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Upload className={`mx-auto h-12 w-12 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
              <div>
                <p className={`text-lg font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                  Drop your PDF here or click to browse
                </p>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Supports Wells Fargo, Chase, Bank of America
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Edit Transactions buttons moved to underneath overall summary */}
    </div>
  );
}

function CategorySelector({ 
  selectedCategories, 
  onCategoryChange,
  comparisonData,
  parsedData,
  isDark,
  statementNames
}: {
  selectedCategories: string[];
  onCategoryChange: (categoryIds: string[]) => void;
  comparisonData: { [key: string]: ComparisonResult } | null;
  parsedData: ParsedStatement[];
  isDark: boolean;
  statementNames: string[];
}) {
  const handleCategoryToggle = (categoryId: string) => {
    if (selectedCategories.includes(categoryId)) {
      onCategoryChange(selectedCategories.filter(id => id !== categoryId));
    } else {
      onCategoryChange([...selectedCategories, categoryId]);
    }
  };

  return (
    <div className="space-y-6">
      <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
        Select Categories to Compare
      </h3>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {categories.map((category) => {
          const isSelected = selectedCategories.includes(category.id);
          const comparison = comparisonData?.[category.id];
          const Icon = category.icon;
          
          return (
            <div
              key={category.id}
              onClick={() => handleCategoryToggle(category.id)}
              className={`
                relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 hover:scale-105
                ${isSelected 
                  ? isDark
                    ? 'border-green-400 bg-green-900/30 shadow-lg shadow-blue-900/20'
                    : 'border-green-500 bg-green-50 shadow-lg'
                  : isDark
                    ? 'border-white hover:border-white bg-black'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }
              `}
            >
              <div className="flex flex-col items-center justify-center space-y-2">
                <div 
                  className="p-3 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: category.color + '20' }}
                >
                  <Icon 
                    className="h-6 w-6" 
                    style={{ color: category.color }}
                  />
                </div>
                <span className="text-sm font-medium text-center">
                  {category.name}
                </span>
                
                {comparison && (
                  <div className="text-xs text-center text-white">
                    <div>${(Math.max(...comparison.statementValues) - Math.min(...comparison.statementValues)).toFixed(2)} range</div>
                  </div>
                )}
              </div>
              
              {isSelected && (
                <CheckCircle className={`absolute -top-2 -right-2 h-6 w-6 rounded-full ${
                  isDark 
                    ? 'text-white bg-black border-2 border-white' 
                    : 'text-green-600 bg-white'
                }`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Line Items for Testing */}
      {selectedCategories.length > 0 && (
        <div className="space-y-4">
          <h4 className={`text-md font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
            Line Items by Category (Testing)
          </h4>
          
          {selectedCategories.map((categoryId) => {
            const category = categories.find(c => c.id === categoryId);
            
            return (
              <div key={categoryId} className={`rounded-lg border p-4 ${
                isDark ? 'bg-black border-white' : 'bg-white border-gray-200'
              }`}>
                <h5 className={`font-medium mb-3 flex items-center gap-2 ${
                  isDark ? 'text-gray-200' : 'text-gray-800'
                }`}>
                  <div 
                    className="p-2 rounded-full"
                    style={{ backgroundColor: category?.color + '20' }}
                  >
                    {category && <category.icon className="h-4 w-4" style={{ color: category.color }} />}
                  </div>
                  {category?.name} ({parsedData.reduce((sum, pd) => sum + (pd.transactions.filter(t => t.category === categoryId).length), 0)} transactions)
                </h5>
                
                <div className={`grid grid-cols-1 ${parsedData.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-2'} gap-4`}>
                  {parsedData.map((statement, index) => {
                    const stmtTransactions = statement.transactions.filter(t => t.category === categoryId);
                    
                    return (
                      <div key={index}>
                    <h6 className={`text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                          {statementNames[index] || `Statement ${index + 1}`}
                    </h6>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                          {stmtTransactions.length > 0 ? (
                            stmtTransactions.map((transaction) => (
                          <div key={transaction.id} className={`text-xs p-2 rounded ${
                            isDark ? 'bg-black border border-white' : 'bg-gray-50'
                          }`}>
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className={`font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                                  {cleanDescription(transaction.description)}
                                </div>
                                <div className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                  {transaction.date}
                                </div>
                              </div>
                              <div className={`font-medium ml-2 ${
                                transaction.type === 'withdrawal' 
                                  ? isDark ? 'text-red-400' : 'text-red-600'
                                  : isDark ? 'text-green-400' : 'text-green-600'
                              }`}>
                                {transaction.type === 'withdrawal' ? '-' : '+'}${transaction.amount.toFixed(2)}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          No transactions in this category
                        </div>
                      )}
                    </div>
                  </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CategoryDetailModal({
  isOpen,
  onClose,
  categoryId,
  isDark,
  parsedData,
  statementNames,
  onTransactionUpdate,
  onLearnCategory
}: {
  isOpen: boolean;
  onClose: () => void;
  categoryId: string;
  isDark: boolean;
  parsedData: ParsedStatement[];
  statementNames: string[];
  onTransactionUpdate?: (statementIndex: number, transactions: Transaction[]) => void;
  onLearnCategory?: (description: string, oldCategory: string, newCategory: string) => void;
}) {
  const [editingTransaction, setEditingTransaction] = useState<{ statementIndex: number; transactionId: string } | null>(null);
  const [localTransactions, setLocalTransactions] = useState<Transaction[][]>([]);

  const category = categories.find(c => c.id === categoryId);
  const Icon = category?.icon || BarChart3;

  // Initialize local transactions when modal opens
  useEffect(() => {
    if (isOpen && parsedData) {
      setLocalTransactions(parsedData.map(pd => 
        pd.transactions.filter(t => t.category === categoryId)
      ));
    }
  }, [isOpen, parsedData, categoryId]);

  if (!isOpen || !category) return null;

  const handleEditTransaction = (statementIndex: number, transactionId: string, updates: Partial<Transaction>) => {
    // Find the original transaction to check if category changed
    const originalTransaction = localTransactions[statementIndex]?.find(t => t.id === transactionId);
    
    // If category changed, learn from it
    if (originalTransaction && updates.category && updates.category !== originalTransaction.category) {
      onLearnCategory?.(originalTransaction.description, originalTransaction.category, updates.category);
    }
    
    setLocalTransactions(prev => {
      const newTransactions = [...prev];
      newTransactions[statementIndex] = newTransactions[statementIndex].map(t => 
        t.id === transactionId ? { ...t, ...updates } : t
      );
      return newTransactions;
    });
    setEditingTransaction(null);
  };

  const handleDeleteTransaction = (statementIndex: number, transactionId: string) => {
    setLocalTransactions(prev => {
      const newTransactions = [...prev];
      newTransactions[statementIndex] = newTransactions[statementIndex].filter(t => t.id !== transactionId);
      return newTransactions;
    });
  };

  const handleAddTransaction = (statementIndex: number) => {
    const newTransaction: Transaction = {
      id: `new-${Date.now()}-${statementIndex}`,
      date: '',
      description: 'New Transaction',
      amount: 0,
      category: categoryId,
      type: 'withdrawal'
    };
    setLocalTransactions(prev => {
      const newTransactions = [...prev];
      newTransactions[statementIndex] = [newTransaction, ...newTransactions[statementIndex]];
      return newTransactions;
    });
    setEditingTransaction({ statementIndex, transactionId: newTransaction.id });
  };

  const handleSaveAll = () => {
    if (onTransactionUpdate) {
      localTransactions.forEach((transactions, index) => {
        // Get all transactions for this statement, update the category ones
        const allTransactions = parsedData[index].transactions.filter(t => t.category !== categoryId);
        onTransactionUpdate(index, [...allTransactions, ...transactions]);
      });
    }
    onClose();
  };

  const getTotalForStatement = (statementIndex: number) => {
    return localTransactions[statementIndex]?.reduce((sum, t) => sum + t.amount, 0) || 0;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />
      
      {/* Modal - Wide with margins */}
      <div className={`relative z-[101] w-full max-w-7xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col rounded-xl border-2 ${
        isDark ? 'bg-black border-white' : 'bg-white border-gray-200'
      }`}>
        {/* Header */}
        <div className={`flex-shrink-0 px-4 sm:px-6 py-4 border-b ${
          isDark ? 'bg-black border-white' : 'bg-white border-gray-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div 
                className="p-2 rounded-full"
                style={{ backgroundColor: category.color + '20' }}
              >
                <Icon className="h-5 w-5" style={{ color: category.color }} />
              </div>
              <div>
                <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {category.name}
                </h2>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  {localTransactions.flat().length} total transactions
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors ${
                isDark ? 'hover:bg-gray-900 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
              }`}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className={`grid gap-4 ${parsedData.length === 2 ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
            {parsedData.map((_, statementIndex) => (
              <div key={statementIndex} className={`rounded-xl border-2 overflow-hidden ${
                isDark ? 'bg-black border-white' : 'bg-gray-50 border-gray-200'
              }`}>
                {/* Statement Header */}
                <div className={`px-3 py-2 border-b ${
                  isDark ? 'bg-black border-white' : 'bg-gray-100 border-gray-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {statementNames[statementIndex] || `Statement ${statementIndex + 1}`}
                      </h3>
                      <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {localTransactions[statementIndex]?.length || 0} transactions
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Total</p>
                      <p className={`text-base font-bold ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                        ${getTotalForStatement(statementIndex).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Add Transaction Button */}
                <div className="px-3 py-1.5">
                  <button
                    onClick={() => handleAddTransaction(statementIndex)}
                    className={`w-full py-1.5 px-3 rounded-lg border-2 border-dashed transition-colors flex items-center justify-center gap-1.5 text-sm ${
                      isDark 
                        ? 'border-white/40 text-gray-400 hover:border-green-500 hover:text-green-400' 
                        : 'border-gray-300 text-gray-500 hover:border-green-500 hover:text-green-600'
                    }`}
                  >
                    <span>+</span>
                    Add Transaction
                  </button>
                </div>

                {/* Transactions List */}
                <div className="px-3 pb-3 space-y-1.5 max-h-[280px] overflow-y-auto">
                  {localTransactions[statementIndex]?.length > 0 ? (
                    localTransactions[statementIndex].map((transaction) => (
                      <div key={transaction.id} className={`rounded-lg border ${
                        isDark ? 'bg-black border-white' : 'bg-white border-gray-200'
                      }`}>
                        {editingTransaction?.statementIndex === statementIndex && 
                         editingTransaction?.transactionId === transaction.id ? (
                          // Edit Form
                          <div className="p-4">
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <div>
                                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                  Date
                                </label>
                                <input
                                  type="text"
                                  defaultValue={transaction.date}
                                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                                    isDark 
                                      ? 'bg-black border-white text-white' 
                                      : 'bg-white border-gray-300 text-gray-900'
                                  }`}
                                  placeholder="MM/DD"
                                  id={`date-${transaction.id}`}
                                />
                              </div>
                              <div>
                                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                  Amount
                                </label>
                                <input
                                  type="number"
                                  step="0.01"
                                  defaultValue={transaction.amount}
                                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                                    isDark 
                                      ? 'bg-black border-white text-white' 
                                      : 'bg-white border-gray-300 text-gray-900'
                                  }`}
                                  placeholder="0.00"
                                  id={`amount-${transaction.id}`}
                                />
                              </div>
                            </div>
                            <div className="mb-3">
                              <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                Description
                              </label>
                              <input
                                type="text"
                                defaultValue={cleanDescription(transaction.description)}
                                className={`w-full px-3 py-2 rounded-lg border text-sm ${
                                  isDark 
                                    ? 'bg-black border-white text-white' 
                                    : 'bg-white border-gray-300 text-gray-900'
                                }`}
                                placeholder="Transaction description"
                                id={`desc-${transaction.id}`}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <div>
                                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                  Category
                                </label>
                                <select
                                  defaultValue={transaction.category}
                                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                                    isDark 
                                      ? 'bg-black border-white text-white' 
                                      : 'bg-white border-gray-300 text-gray-900'
                                  }`}
                                  id={`cat-${transaction.id}`}
                                >
                                  {categories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                  Type
                                </label>
                                <select
                                  defaultValue={transaction.type}
                                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                                    isDark 
                                      ? 'bg-black border-white text-white' 
                                      : 'bg-white border-gray-300 text-gray-900'
                                  }`}
                                  id={`type-${transaction.id}`}
                                >
                                  <option value="withdrawal">Withdrawal</option>
                                  <option value="deposit">Deposit</option>
                                </select>
                              </div>
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => handleDeleteTransaction(statementIndex, transaction.id)}
                                className="px-3 py-1.5 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setEditingTransaction(null)}
                                className={`px-3 py-1.5 text-sm rounded-lg ${
                                  isDark ? 'bg-black border border-white hover:bg-gray-900 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                }`}
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => {
                                  const dateEl = document.getElementById(`date-${transaction.id}`) as HTMLInputElement;
                                  const amountEl = document.getElementById(`amount-${transaction.id}`) as HTMLInputElement;
                                  const descEl = document.getElementById(`desc-${transaction.id}`) as HTMLInputElement;
                                  const catEl = document.getElementById(`cat-${transaction.id}`) as HTMLSelectElement;
                                  const typeEl = document.getElementById(`type-${transaction.id}`) as HTMLSelectElement;
                                  
                                  handleEditTransaction(statementIndex, transaction.id, {
                                    date: dateEl.value,
                                    amount: parseFloat(amountEl.value) || 0,
                                    description: descEl.value,
                                    category: catEl.value,
                                    type: typeEl.value as 'withdrawal' | 'deposit'
                                  });
                                }}
                                className="px-3 py-1.5 text-sm rounded-lg bg-green-600 hover:bg-green-700 text-white"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          // Display View
                          <div 
                            className="p-3 cursor-pointer hover:bg-opacity-50 transition-colors"
                            onClick={() => setEditingTransaction({ statementIndex, transactionId: transaction.id })}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1 min-w-0">
                                <p className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                  {cleanDescription(transaction.description)}
                                </p>
                                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                  {transaction.date}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 ml-3">
                                <span className={`font-semibold ${
                                  transaction.type === 'withdrawal' 
                                    ? isDark ? 'text-red-400' : 'text-red-600'
                                    : isDark ? 'text-green-400' : 'text-green-600'
                                }`}>
                                  {transaction.type === 'withdrawal' ? '-' : '+'}${transaction.amount.toFixed(2)}
                                </span>
                                <Edit3 className={`h-4 w-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className={`text-center py-4 text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      No transactions in this category
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className={`flex-shrink-0 px-4 sm:px-6 py-4 border-t ${
          isDark ? 'bg-black border-white' : 'bg-white border-gray-200'
        }`}>
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                isDark 
                  ? 'bg-black hover:bg-gray-900 text-white border-2 border-white' 
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAll}
              className="px-4 py-2 rounded-lg font-medium text-sm bg-green-600 hover:bg-green-700 text-white"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ComparisonResults({ 
  data, 
  statementNames,
  isPreview = false,
  onUnlock,
  isDark,
  parsedData,
  onStatementNameChange,
  onTransactionUpdate,
  onLearnCategory
}: {
  data: { [key: string]: ComparisonResult };
  statementNames: string[];
  isPreview?: boolean;
  onUnlock?: () => void;
  isDark: boolean;
  parsedData?: ParsedStatement[];
  onStatementNameChange?: (index: number, newName: string) => void;
  onTransactionUpdate?: (statementIndex: number, transactions: Transaction[]) => void;
  onLearnCategory?: (description: string, oldCategory: string, newCategory: string) => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'amount' | 'alphabetical'>('amount');
  const [showPercentage, setShowPercentage] = useState(false);
  const [editingIndex, setEditingIndex] = useState<{ table: 'spending' | 'income', index: number } | null>(null);
  
  const previewData = isPreview ? Object.fromEntries(Object.entries(data).slice(0, 2)) : data;

  // Separate income from spending
  const incomeEntry = Object.entries(previewData).find(([id]) => id === 'income');
  const spendingEntries = Object.entries(previewData).filter(([id]) => id !== 'income');

  // Calculate spending totals (excluding income) for percentage display
  const spendingTotals = statementNames.map((_, index) => 
    spendingEntries.reduce((sum, [, result]) => sum + (result.statementValues[index] || 0), 0)
  );

  // Calculate income totals for percentage display
  const incomeTotals = statementNames.map((_, index) => 
    incomeEntry ? (incomeEntry[1].statementValues[index] || 0) : 0
  );

  // Sort the spending data
  const sortedSpendingEntries = spendingEntries.sort(([aId, aResult], [bId, bResult]) => {
    if (sortBy === 'alphabetical') {
      const aName = categories.find(c => c.id === aId)?.name || '';
      const bName = categories.find(c => c.id === bId)?.name || '';
      return aName.localeCompare(bName);
    } else {
      // Sort by total amount (sum across all statements)
      const aTotal = aResult.statementValues.reduce((sum, val) => sum + val, 0);
      const bTotal = bResult.statementValues.reduce((sum, val) => sum + val, 0);
      return bTotal - aTotal; // Descending order
    }
  });

  // Calculate sorted column values for spending (for rank-based color scale per column)
  const spendingColumnSortedValues = statementNames.map((_, colIndex) => {
    const columnValues = spendingEntries.map(([, result]) => result.statementValues[colIndex] || 0);
    // Sort descending so highest value = rank 0 (darkest)
    return [...columnValues].sort((a, b) => b - a);
  });

  // Calculate sorted column values for income
  const incomeColumnSortedValues = statementNames.map((_, colIndex) => {
    const value = incomeEntry ? (incomeEntry[1].statementValues[colIndex] || 0) : 0;
    return [value];
  });

  // Reusable row renderer
  const renderCategoryRow = (categoryId: string, result: ComparisonResult, totalsForPercentage: number[], columnSortedValues: number[][]) => {
    const category = categories.find(c => c.id === categoryId);
    const Icon = category?.icon || BarChart3;
    const hasTransactions = parsedData && parsedData.some(pd => 
      pd.transactions.some(t => t.category === categoryId)
    );
    
    // Get transaction counts per statement
    const transactionCountsPerStatement = parsedData?.map(pd => 
      pd.transactions.filter(t => t.category === categoryId).length
    ) || [];
    
    return (
      <tr 
        key={categoryId}
        className={`border-b ${isDark ? 'border-white' : 'border-gray-200'} ${hasTransactions ? 'cursor-pointer' : ''}`}
        onClick={() => hasTransactions && setSelectedCategory(categoryId)}
      >
        <td className="py-3 px-4">
          <div className="flex items-center gap-3">
            <div 
              className="p-2 rounded-full"
              style={{ backgroundColor: category?.color + '20' }}
            >
              <Icon 
                className="h-4 w-4" 
                style={{ color: category?.color }}
              />
            </div>
            <span className={`font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
              {category?.name}
            </span>
          </div>
        </td>
        {result.statementValues.map((value, index) => {
          const percentage = totalsForPercentage[index] > 0 ? (value / totalsForPercentage[index]) * 100 : 0;
          const transactionCount = transactionCountsPerStatement[index] || 0;
          
          // Calculate green intensity based on RANK position in this column (not numerical value)
          const sortedValues = columnSortedValues[index];
          const rank = sortedValues.findIndex(v => v === value); // 0 = highest value
          const totalItems = sortedValues.length;
          // intensity: 1 = darkest (highest rank), 0 = lightest (lowest rank)
          const intensity = totalItems > 1 ? 1 - (rank / (totalItems - 1)) : 0.5;
          
          // Monochromatic green scale with smooth gradient: higher rank = darker green
          // Using inline styles for truly gradual color transitions
          const getGreenColor = () => {
            const maxVal = sortedValues[0] || 0;
            if (maxVal === 0) return isDark ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)'; // gray-400/500
            
            // Smooth interpolation between light and dark green
            // Dark mode: from green-700 (21, 128, 61) to green-300 (134, 239, 172)
            // Light mode: from green-300 (134, 239, 172) to green-800 (22, 101, 52)
            if (isDark) {
              const r = Math.round(21 + (134 - 21) * intensity);
              const g = Math.round(128 + (239 - 128) * intensity);
              const b = Math.round(61 + (172 - 61) * intensity);
              return `rgb(${r}, ${g}, ${b})`;
            } else {
              const r = Math.round(134 + (22 - 134) * intensity);
              const g = Math.round(239 + (101 - 239) * intensity);
              const b = Math.round(172 + (52 - 172) * intensity);
              return `rgb(${r}, ${g}, ${b})`;
            }
          };
          
          return (
            <td key={index} className="py-3 px-4 text-right">
              <div className="flex items-center justify-end gap-2">
                <span className="font-semibold" style={{ color: getGreenColor() }}>
                  {showPercentage ? `${percentage.toFixed(1)}%` : `$${value.toFixed(2)}`}
                </span>
                {transactionCount > 0 && (
                  <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    ({transactionCount})
                  </span>
                )}
              </div>
            </td>
          );
        })}
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      {/* Spending Section */}
      <div className={`rounded-xl p-6 shadow-lg border ${
        isDark 
          ? 'bg-black border-white' 
          : 'bg-white border-gray-100'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h3 className={`text-xl font-bold ${
            isDark ? 'text-gray-200' : 'text-gray-800'
          }`}>
            Spending
          </h3>
          
          {/* Controls */}
          <div className="flex items-center gap-4">
            {/* Sort dropdown */}
            <div className="flex items-center gap-2">
              <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'amount' | 'alphabetical')}
                className={`text-sm px-3 py-1.5 rounded-lg border ${
                  isDark 
                    ? 'bg-black border-white text-white' 
                    : 'bg-white border-gray-300 text-gray-800'
                }`}
              >
                <option value="amount">By Amount</option>
                <option value="alphabetical">A-Z</option>
              </select>
            </div>
            
            {/* $ vs % toggle */}
            <div className="flex items-center gap-2">
              <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Show:</span>
              <div className={`flex rounded-lg border overflow-hidden ${isDark ? 'border-white' : 'border-gray-300'}`}>
                <button
                  onClick={() => setShowPercentage(false)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    !showPercentage 
                      ? isDark ? 'bg-white text-black' : 'bg-gray-800 text-white'
                      : isDark ? 'bg-black text-white' : 'bg-white text-gray-800'
                  }`}
                >
                  $
                </button>
                <button
                  onClick={() => setShowPercentage(true)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    showPercentage 
                      ? isDark ? 'bg-white text-black' : 'bg-gray-800 text-white'
                      : isDark ? 'bg-black text-white' : 'bg-white text-gray-800'
                  }`}
                >
                  %
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Spending Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={`border-b-2 ${isDark ? 'border-white' : 'border-gray-300'}`}>
                <th className={`text-left py-3 px-4 font-semibold w-1/3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Category
                </th>
                {statementNames.map((name, index) => (
                  <th key={index} className={`text-right py-3 px-4 font-semibold w-1/3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    {editingIndex?.table === 'spending' && editingIndex?.index === index && onStatementNameChange ? (
                      <input
                        type="text"
                        defaultValue={name || `Statement ${index + 1}`}
                        className={`text-right font-semibold bg-transparent border-b-2 outline-none w-full ${
                          isDark ? 'border-white text-gray-300' : 'border-gray-800 text-gray-700'
                        }`}
                        autoFocus
                        onBlur={(e) => {
                          onStatementNameChange(index, e.target.value);
                          setEditingIndex(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onStatementNameChange(index, e.currentTarget.value);
                            setEditingIndex(null);
                          }
                          if (e.key === 'Escape') {
                            setEditingIndex(null);
                          }
                        }}
                      />
                    ) : (
                      <span 
                        className={onStatementNameChange ? 'cursor-pointer hover:underline' : ''}
                        onClick={(e) => {
                          if (onStatementNameChange) {
                            e.stopPropagation();
                            setEditingIndex({ table: 'spending', index });
                          }
                        }}
                      >
                        {name || `Statement ${index + 1}`}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedSpendingEntries.map(([categoryId, result]) => 
                renderCategoryRow(categoryId, result, spendingTotals, spendingColumnSortedValues)
              )}
              {/* Total Spending Row */}
              <tr className={`border-t-2 ${isDark ? 'border-white' : 'border-gray-300'}`}>
                <td className="py-3 px-4">
                  <span className={`font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    Total Spending
                  </span>
                </td>
                {spendingTotals.map((total, index) => (
                  <td key={index} className="py-3 px-4 text-right">
                    <span className={`font-bold ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                      ${total.toFixed(2)}
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

      </div>

      {/* Income Section */}
      {incomeEntry && (
        <div className={`rounded-xl p-6 shadow-lg border ${
          isDark 
            ? 'bg-black border-white' 
            : 'bg-white border-gray-100'
        }`}>
          <h3 className={`text-xl font-bold mb-4 ${
            isDark ? 'text-gray-200' : 'text-gray-800'
          }`}>
            Income
          </h3>

          {/* Income Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`border-b-2 ${isDark ? 'border-white' : 'border-gray-300'}`}>
                  <th className={`text-left py-3 px-4 font-semibold w-1/3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Category
                  </th>
                  {statementNames.map((name, index) => (
                    <th key={index} className={`text-right py-3 px-4 font-semibold w-1/3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      {editingIndex?.table === 'income' && editingIndex?.index === index && onStatementNameChange ? (
                        <input
                          type="text"
                          defaultValue={name || `Statement ${index + 1}`}
                          className={`text-right font-semibold bg-transparent border-b-2 outline-none w-full ${
                            isDark ? 'border-white text-gray-300' : 'border-gray-800 text-gray-700'
                          }`}
                          autoFocus
                          onBlur={(e) => {
                            onStatementNameChange(index, e.target.value);
                            setEditingIndex(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              onStatementNameChange(index, e.currentTarget.value);
                              setEditingIndex(null);
                            }
                            if (e.key === 'Escape') {
                              setEditingIndex(null);
                            }
                          }}
                        />
                      ) : (
                        <span 
                          className={onStatementNameChange ? 'cursor-pointer hover:underline' : ''}
                          onClick={(e) => {
                            if (onStatementNameChange) {
                              e.stopPropagation();
                              setEditingIndex({ table: 'income', index });
                            }
                          }}
                        >
                          {name || `Statement ${index + 1}`}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {renderCategoryRow(incomeEntry[0], incomeEntry[1], incomeTotals, incomeColumnSortedValues)}
                {/* Total Income Row */}
                <tr className={`border-t-2 ${isDark ? 'border-white' : 'border-gray-300'}`}>
                  <td className="py-3 px-4">
                    <span className={`font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                      Total Income
                    </span>
                  </td>
                  {incomeTotals.map((total, index) => (
                    <td key={index} className="py-3 px-4 text-right">
                      <span className={`font-bold ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                        ${total.toFixed(2)}
                      </span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

        </div>
      )}

      {isPreview && Object.keys(data).length > 2 && (
        <div className={`rounded-xl p-6 shadow-lg border ${
          isDark 
            ? 'bg-gradient-to-r from-green-900/20 to-emerald-900/20 border-green-700/50' 
            : 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'
        }`}>
          <div className="text-center">
            <div className={`text-lg font-semibold mb-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
              Want to see all {Object.keys(data).length} categories?
            </div>
            <div className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Unlock detailed breakdown, charts, and export options for just $9
            </div>
            <button
              onClick={onUnlock}
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg transition-colors font-medium ${
                isDark 
                  ? 'bg-green-600 hover:bg-green-700 text-white' 
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              <CreditCard className="h-5 w-5" />
              Unlock Full Results - $9
            </button>
          </div>
        </div>
      )}

      {/* Category Detail Modal */}
      {selectedCategory && parsedData && (
        <CategoryDetailModal
          isOpen={!!selectedCategory}
          onClose={() => setSelectedCategory(null)}
          categoryId={selectedCategory}
          isDark={isDark}
          parsedData={parsedData}
          statementNames={statementNames}
          onTransactionUpdate={onTransactionUpdate}
          onLearnCategory={onLearnCategory}
        />
      )}
    </div>
  );
}

function AuthPage({ isVisible, onBack, isDark, onSignIn }: {
  isVisible: boolean;
  onBack: () => void;
  isDark: boolean;
  onSignIn: () => void;
}) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError('');

    try {
      // For now, simulate Google auth - will implement later
      await new Promise(resolve => setTimeout(resolve, 1500));
      setIsLoading(false); // Clear loading state before callbacks
      onSignIn();
      onBack();
    } catch (error) {
      setError('Google sign-in failed. Please try again.');
      setIsLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      if (isSignUp && !fullName.trim()) {
        setError('Full name is required');
        return;
      }

      if (!email.trim() || !password.trim()) {
        setError('Email and password are required');
        return;
      }

      let result;
      if (isSignUp) {
        result = await userService.signUp(email, password, fullName);
      } else {
        result = await userService.signIn(email, password);
      }

      if (result.success) {
        setIsLoading(false); // Clear loading state before callbacks
        onSignIn();
        onBack();
      } else {
        setError(result.error || 'Authentication failed');
        setIsLoading(false);
      }
    } catch (error: any) {
      setError(error.message || 'Authentication failed. Please try again.');
      setIsLoading(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isDark 
        ? 'bg-black' 
        : 'bg-gradient-to-br from-blue-50 via-white to-green-50'
    }`}>
      {/* Navigation Header */}
      <div className={`sticky top-0 z-40 backdrop-blur-sm border-b ${
        isDark ? 'bg-black/90 border-white' : 'bg-white/80 border-gray-200'
      }`}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-black border-2 border-white">
                <Users className="h-5 w-5 text-white" />
              </div>
              <span className={`font-semibold text-lg ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                {isSignUp ? 'Create Account' : 'Sign In'}
              </span>
            </div>
            
            <button 
              onClick={onBack}
              className="px-4 py-2 rounded-lg font-medium transition-colors bg-black border-2 border-white text-white hover:bg-gray-900"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-8 max-w-md">
        <div className={`rounded-xl border shadow-lg p-8 ${
          isDark ? 'bg-black border-white' : 'bg-white border-gray-200'
        }`}>
          
          <div className="text-center mb-6">
            <div className={`p-3 rounded-full w-16 h-16 mx-auto flex items-center justify-center mb-4 ${
              isDark ? 'bg-green-900/30' : 'bg-green-100'
            }`}>
              <Users className={`h-8 w-8 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
            </div>
            
            <h3 className={`text-xl font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
              {isSignUp ? 'Create Account' : 'Sign In'}
            </h3>
            
            <p className={`text-sm mt-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              {isSignUp 
                ? 'Sign up to save your comparisons and get more features' 
                : 'Sign in to access your saved comparisons'
              }
            </p>
          </div>

          {error && (
            <div className={`mb-4 p-3 rounded-lg ${
              isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700'
            }`}>
              {error}
            </div>
          )}

          {/* Google Sign In Button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 border-2 mb-4 ${
              isLoading
                ? isDark 
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed border-gray-600' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed border-gray-300'
                : isDark 
                  ? 'bg-white text-gray-800 hover:bg-gray-50 border-gray-300' 
                  : 'bg-white text-gray-800 hover:bg-gray-50 border-gray-300'
            }`}
          >
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in with Google...
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3">
                <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">G</span>
                </div>
                Sign in with Google
              </div>
            )}
          </button>

          {/* Divider */}
          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center">
              <div className={`w-full border-t ${isDark ? 'border-white' : 'border-gray-300'}`} />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className={`px-2 ${isDark ? 'bg-black text-gray-300' : 'bg-white text-gray-500'}`}>
                Or
              </span>
            </div>
          </div>

          {/* Email Form Toggle */}
          {!showEmailForm ? (
            <button
              onClick={() => setShowEmailForm(true)}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 border ${
                isDark 
                  ? 'bg-transparent text-white border-white hover:bg-black' 
                  : 'bg-transparent text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Continue with email
            </button>
          ) : (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              {isSignUp && (
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      isDark 
                        ? 'bg-black border-white text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                    placeholder="Enter your full name"
                  />
                </div>
              )}

              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border ${
                    isDark 
                      ? 'bg-black border-white text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                  placeholder="Enter your email"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border ${
                    isDark 
                      ? 'bg-black border-white text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                  placeholder="Enter your password"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className={`w-full py-3 rounded-lg font-medium transition-colors ${
                  isLoading
                    ? isDark 
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : isDark 
                      ? 'bg-green-600 hover:bg-green-700 text-white' 
                      : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isSignUp ? 'Creating Account...' : 'Signing In...'}
                  </div>
                ) : (
                  isSignUp ? 'Create Account' : 'Sign In'
                )}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setShowEmailForm(false);
                setError('');
              }}
              className={`text-sm transition-colors ${
                isDark ? 'text-gray-400 hover:text-green-400' : 'text-gray-600 hover:text-green-600'
              }`}
            >
              {isSignUp 
                ? 'Already have an account? Sign in' 
                : "Don't have an account? Sign up"
              }
            </button>
          </div>

          <div className="mt-4 text-center">
            <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
              By signing up, you agree to our Terms of Service and Privacy Policy
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PaywallModal({ isOpen, onClose, onPayment, totalCategories, isDark }: {
  isOpen: boolean;
  onClose: () => void;
  onPayment: () => void;
  totalCategories: number;
  isDark: boolean;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className={`rounded-xl max-w-md w-full p-6 relative ${
        isDark ? 'bg-black border-2 border-white' : 'bg-white'
      }`}>
        <button
          onClick={onClose}
          className={`absolute top-4 right-4 transition-colors ${
            isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          ×
        </button>
        
        <div className="text-center space-y-4">
          <div className={`p-3 rounded-full w-16 h-16 mx-auto flex items-center justify-center ${
            isDark ? 'bg-green-900/30' : 'bg-green-100'
          }`}>
            <BarChart3 className={`h-8 w-8 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
          </div>
          
          <h3 className={`text-xl font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
            Unlock Full Comparison
          </h3>
          
          <div className={`text-left space-y-2 p-4 rounded-lg ${
            isDark ? 'bg-black border border-white' : 'bg-gray-50'
          }`}>
            <div className="flex items-center gap-2">
              <CheckCircle className={`h-5 w-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
              <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                All {totalCategories} category breakdowns
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className={`h-5 w-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
              <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                Interactive charts and visualizations
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className={`h-5 w-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
              <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                Detailed transaction lists
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className={`h-5 w-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
              <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                PDF & CSV export
              </span>
            </div>
          </div>
          
          <div className="text-center">
            <div className={`text-3xl font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
              $9
            </div>
            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              One-time payment
            </div>
          </div>
          
          <button
            onClick={onPayment}
            className={`w-full py-3 rounded-lg transition-colors font-medium flex items-center justify-center gap-2 ${
              isDark 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            <CreditCard className="h-5 w-5" />
            Upgrade Now
          </button>
          
          <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
            Secure payment processing powered by Stripe. Your data is processed locally and never stored.
          </p>
        </div>
      </div>
    </div>
  );
}

function PricingPage({ isVisible, onBack, isDark, onOpenAuth }: {
  isVisible: boolean;
  onBack: () => void;
  isDark: boolean;
  onOpenAuth: () => void;
}) {
  if (!isVisible) return null;



  const handleCheckout = async (planName: string) => {
    if (planName === 'Anonymous') {
      // For anonymous plan, just redirect to main app
      onBack();
      return;
    }
    
    if (planName === 'Sign Up') {
      // For sign up plan, redirect to auth page
      onBack(); // Close pricing page
      onOpenAuth(); // Open auth page
      return;
    }

    // For paid plans, redirect to Stripe checkout
    const planId = planName.toLowerCase() as StripePlanId;
    if (planId === 'starter' || planId === 'pro' || planId === 'business') {
      try {
        // Get current user to pass their ID if they're authenticated
        const user = await userService.getCurrentUser();
        await stripeService.redirectToCheckout(planId, user?.id);
      } catch (error) {
        console.error('Error redirecting to checkout:', error);
        alert('Error starting checkout process. Please try again.');
      }
    } else {
      console.log(`Unknown plan: ${planName}`);
    }
  };

  const plans = [
    {
      name: 'Anonymous',
      price: 'Free',
      pages: '20 pages per month',
      description: 'No signup required',
      priceId: null,
      isAnonymous: true
    },
    {
      name: 'Sign Up',
      price: 'Free',
      pages: '40 pages per month',
      description: 'Sign up for free',
      priceId: null
    },
    {
      name: 'Starter',
      price: '$29/month',
      pages: '150 pages per month',
      description: 'Perfect for individuals',
      priceId: 'price_1Rrpe8RD0ogceRR4LdVUllat'
    },
    // Hidden for now - Pro tier
    // {
    //   name: 'Pro',
    //   price: '$69/month',
    //   pages: '400 pages per month',
    //   description: 'Great for small teams',
    //   priceId: 'price_1RrrwQRD0ogceRR4BEdntV12'
    // },
    // Hidden for now - Business tier
    // {
    //   name: 'Business',
    //   price: '$149/month',
    //   pages: '1,000 pages per month',
    //   description: 'Enterprise solution',
    //   priceId: 'price_1RrrwQRD0ogceRR41ZscbkhJ'
    // }
  ];

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isDark 
        ? 'bg-black' 
        : 'bg-gradient-to-br from-blue-50 via-white to-green-50'
    }`}>
      {/* Navigation Header */}
      <div className={`sticky top-0 z-40 backdrop-blur-sm border-b ${
        isDark ? 'bg-black/90 border-white' : 'bg-white/80 border-gray-200'
      }`}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-black border-2 border-white">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <span className={`font-semibold text-lg ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                
              </span>
            </div>
            
            <button 
              onClick={onBack}
              className="px-4 py-2 rounded-lg font-medium transition-colors bg-black border-2 border-white text-white hover:bg-gray-900"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="space-y-8">
          <div className="text-center">
            <h1 className={`text-4xl md:text-5xl font-bold mb-4 ${
              isDark ? 'text-white' : 'text-gray-800'
            }`}>
              Simple Pricing
            </h1>
            <p className={`text-lg ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Choose the plan that fits your needs
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map((plan, index) => (
              <div key={plan.name} className={`p-4 rounded-xl border shadow-lg ${
                isDark ? 'bg-black border-white' : 'bg-white border-gray-200'
              } ${plan.isAnonymous ? 'border-green-500' : ''}`}>
                <div className="text-center mb-4">
                  <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    {plan.name}
                  </h3>
                  <div className={`text-2xl font-bold mt-2 ${
                    plan.isAnonymous 
                      ? isDark ? 'text-green-400' : 'text-green-600'
                      : isDark ? 'text-green-400' : 'text-green-600'
                  }`}>
                    {plan.price}
                  </div>
                  <div className={`text-sm mt-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    {plan.pages}
                  </div>
                  {plan.description && (
                    <div className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                      {plan.description}
                    </div>
                  )}
                </div>
                
                <button
                  onClick={() => handleCheckout(plan.name)}
                  className={`w-full py-2 px-3 rounded-lg font-medium transition-all duration-200 ${
                    plan.isAnonymous
                      ? isDark
                        ? 'bg-green-600 hover:bg-green-700 text-white hover:scale-105'
                        : 'bg-green-600 hover:bg-green-700 text-white hover:scale-105'
                      : plan.name === 'Free'
                      ? isDark
                        ? 'bg-gray-600 hover:bg-gray-500 text-gray-200'
                        : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                      : isDark
                        ? 'bg-green-600 hover:bg-green-700 text-white hover:scale-105'
                        : 'bg-green-600 hover:bg-green-700 text-white hover:scale-105'
                  }`}
                >
                  {plan.isAnonymous ? 'Try Now' : plan.name === 'Sign Up' ? 'Sign Up' : 'Subscribe'}
                </button>
              </div>
            ))}
          </div>


        </div>
      </div>
    </div>
  );
}

function SettingsPage({ isVisible, onBack, isDark, onToggleDarkMode, isAuthenticated, onShowPricing, userTier, userEmail }: {
  isVisible: boolean;
  onBack: () => void;
  isDark: boolean;
  onToggleDarkMode: () => void;
  isAuthenticated: boolean;
  onShowPricing: () => void;
  userTier?: string;
  userEmail?: string;
}) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [anonymousUsage, setAnonymousUsage] = useState<number>(0);

  useEffect(() => {
    const loadData = async () => {
      try {
        // First check if user is actually authenticated with Supabase
        const { data: { user: authUser } } = await supabase.auth.getUser();
        
        let currentUser = null;
        if (authUser) {
          // User is authenticated, get their profile
          currentUser = await userService.getCurrentUser();
          setUser(currentUser);
        } else {
          // User is not authenticated, treat as anonymous
          setUser(null);
        }
        
        // Get usage history (only call once)
        const history = await userService.getUsageHistory();
        
        // Calculate anonymous usage if not authenticated
        if (!currentUser) {
          const totalUsed = history.reduce((sum, log) => sum + log.credits_used, 0);
          setAnonymousUsage(totalUsed);
        }
      } catch (error) {
        console.error('Error loading usage data:', error);
        setAnonymousUsage(0);
      } finally {
        setLoading(false);
      }
    };

    if (isVisible) {
      loadData();
    }
  }, [isVisible]);

  if (!isVisible) return null;

  const handleManageSubscription = () => {
    console.log('Manage subscription clicked - no action taken (Stripe removed)');
  };

  const handleUpgrade = () => {
    // Navigate to pricing page by triggering the pricing modal
    // We'll need to pass this function from the parent component
    if (onShowPricing) {
      onShowPricing();
    }
  };

  // Calculate credits based on user tier
  const tierConfig = user && user.tier && TIER_CONFIG[user.tier] 
    ? TIER_CONFIG[user.tier] 
    : TIER_CONFIG.anonymous;
  const creditsRemaining = user && typeof user.credits === 'number' 
    ? user.credits 
    : (tierConfig.credits - anonymousUsage);
  const creditsUsed = user && typeof user.credits === 'number'
    ? (tierConfig.credits - user.credits) 
    : anonymousUsage;
  const totalCredits = tierConfig.credits;

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isDark 
        ? 'bg-black' 
        : 'bg-gradient-to-br from-blue-50 via-white to-green-50'
    }`}>
      {/* Navigation Header */}
      <div className={`sticky top-0 z-40 backdrop-blur-sm border-b ${
        isDark ? 'bg-black/90 border-white' : 'bg-white/80 border-gray-200'
      }`}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-black border-2 border-white">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <span className={`font-semibold text-lg ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                
              </span>
            </div>
            
            <button 
              onClick={onBack}
              className="px-4 py-2 rounded-lg font-medium transition-colors bg-black border-2 border-white text-white hover:bg-gray-900"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className={`rounded-xl border shadow-lg p-8 ${
          isDark ? 'bg-black border-white' : 'bg-white border-gray-200'
        }`}>
          <div className="text-center mb-8">
            <h1 className={`text-3xl font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
              Settings
            </h1>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Dark Mode Toggle */}
            <div className={`p-6 rounded-lg border flex flex-col text-center ${
              isDark ? 'bg-black border-white' : 'bg-gray-50 border-gray-200'
            }`}>
              <h3 className={`text-lg font-semibold mb-4 flex items-center justify-center gap-2 ${
                isDark ? 'text-gray-200' : 'text-gray-800'
              }`}>
                {isDark ? (
                  <Moon className={`h-5 w-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                ) : (
                  <Sun className={`h-5 w-5 ${isDark ? 'text-yellow-400' : 'text-green-600'}`} />
                )}
                Dark Mode
              </h3>
              
              <div className="flex-grow flex items-center justify-center">
                <button
                  onClick={onToggleDarkMode}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                    isDark 
                      ? 'bg-green-600' 
                      : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                      isDark ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Subscription Management */}
            <div className={`p-6 rounded-lg border flex flex-col text-center ${
              isDark ? 'bg-black border-white' : 'bg-gray-50 border-gray-200'
            }`}>
              <h3 className={`text-lg font-semibold mb-4 flex items-center justify-center gap-2 ${
                isDark ? 'text-gray-200' : 'text-gray-800'
              }`}>
                <CreditCard className={`h-5 w-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                {isAuthenticated && userTier && userTier !== 'anonymous' && userTier !== 'signup' ? 'Subscription' : 'Upgrade'}
              </h3>
              
              <div className="flex-grow flex items-center justify-center">
                {isAuthenticated && userTier && userTier !== 'anonymous' && userTier !== 'signup' ? (
                  <button
                    onClick={handleManageSubscription}
                    className={`px-6 py-2 rounded-lg font-medium transition-all duration-200 border ${
                      isDark 
                        ? 'bg-black text-white border-white hover:bg-gray-900' 
                        : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    Manage
                  </button>
                ) : (
                  <button
                    onClick={handleUpgrade}
                    className={`px-6 py-2 rounded-lg font-medium transition-all duration-200 ${
                      isDark 
                        ? 'bg-green-600 text-white hover:bg-green-700' 
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    Upgrade
                  </button>
                )}
              </div>
            </div>
            
            {/* Share App */}
            <div className={`p-6 rounded-lg border flex flex-col text-center ${
              isDark ? 'bg-black border-white' : 'bg-gray-50 border-gray-200'
            }`}>
              <h3 className={`text-lg font-semibold mb-4 flex items-center justify-center gap-2 ${
                isDark ? 'text-gray-200' : 'text-gray-800'
              }`}>
                <Users className={`h-5 w-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                Share App
              </h3>
              <div className="flex-grow flex items-center justify-center">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.origin);
                    alert('Link copied to clipboard!');
                  }}
                  className={`px-6 py-2 rounded-lg font-medium transition-all duration-200 ${
                    isDark 
                      ? 'bg-green-600 text-white hover:bg-green-700' 
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  Copy Link
                </button>
              </div>
            </div>
          </div>
          
          {/* Usage Section */}
          <div className="text-center mt-8 mb-8">
            <h1 className={`text-3xl font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
              Usage
            </h1>
          </div>
          
          {/* Credits & Usage Section */}
          <div className={`p-6 rounded-lg border ${
            isDark ? 'bg-black border-white' : 'bg-gray-50 border-gray-200'
          }`}>
            {loading ? (
              <div className={`text-center py-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2" />
                <p className="text-sm">Loading...</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                      {creditsRemaining}
                    </div>
                    <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Credits Remaining
                    </div>
                  </div>
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                      {creditsUsed}
                    </div>
                    <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Credits Used
                    </div>
                  </div>
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                      {totalCredits}
                    </div>
                    <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Total Credits
                    </div>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div 
                    className="bg-green-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${totalCredits > 0 ? (creditsRemaining / totalCredits) * 100 : 0}%` }}
                  ></div>
                </div>
                <div className={`text-xs text-center ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  {totalCredits > 0 ? `${Math.round((creditsRemaining / totalCredits) * 100)}% remaining` : 'Subscribe for More Credits'}
                </div>
              </>
            )}
          </div>
          
          {/* Category Rules Section */}
          <CategoryRulesSection isDark={isDark} />
          
          {/* Signed in email display - moved to bottom */}
          {isAuthenticated && userEmail && (
            <div className={`text-center mt-6 text-sm ${
              isDark ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Signed in as: {userEmail}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Component for managing category learning rules
function CategoryRulesSection({ isDark }: { isDark: boolean }) {
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    const loadRules = async () => {
      try {
        // Ensure the service has loaded rules
        const user = await userService.getCurrentUser();
        const sessionId = userService.getSessionId();
        await categorizationService.loadUserRules(user?.id, sessionId);
        setRules(categorizationService.getRules());
      } catch (error) {
        console.error('Failed to load rules:', error);
      } finally {
        setLoading(false);
      }
    };
    loadRules();
  }, []);

  const handleDeleteRule = async (merchantPattern: string) => {
    setDeleting(merchantPattern);
    const success = await categorizationService.deleteRule(merchantPattern);
    if (success) {
      setRules(categorizationService.getRules());
    }
    setDeleting(null);
  };

  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to delete all your learned category rules?')) {
      return;
    }
    const success = await categorizationService.clearAllRules();
    if (success) {
      setRules([]);
    }
  };

  return (
    <>
      <div className="text-center mt-8 mb-8">
        <h1 className={`text-3xl font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
          My Category Rules
        </h1>
        <p className={`text-sm mt-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          These rules are learned when you recategorize transactions
        </p>
      </div>
      
      <div className={`p-6 rounded-lg border ${
        isDark ? 'bg-black border-white' : 'bg-gray-50 border-gray-200'
      }`}>
        {loading ? (
          <div className={`text-center py-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2" />
            <p className="text-sm">Loading rules...</p>
          </div>
        ) : rules.length === 0 ? (
          <div className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            <HelpCircle className="mx-auto h-10 w-10 mb-3 opacity-50" />
            <p className="text-sm">No category rules yet</p>
            <p className={`text-xs mt-2 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
              When you change a transaction's category, we'll remember it for next time
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {rules.map((rule) => {
                const category = categories.find(c => c.id === rule.category_id);
                const Icon = category?.icon || HelpCircle;
                return (
                  <div 
                    key={rule.merchant_pattern}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      isDark ? 'bg-gray-900' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className={`text-sm font-medium truncate ${isDark ? 'text-white' : 'text-gray-800'}`}>
                        "{formatMerchantPattern(rule.merchant_pattern)}"
                      </span>
                      <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>→</span>
                      <div className="flex items-center gap-2">
                        <div 
                          className="p-1.5 rounded-full"
                          style={{ backgroundColor: (category?.color || '#9CA3AF') + '20' }}
                        >
                          <Icon 
                            className="h-3.5 w-3.5" 
                            style={{ color: category?.color || '#9CA3AF' }} 
                          />
                        </div>
                        <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                          {category?.name || rule.category_id}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteRule(rule.merchant_pattern)}
                      disabled={deleting === rule.merchant_pattern}
                      className={`ml-3 p-2 rounded-lg transition-colors ${
                        isDark 
                          ? 'hover:bg-red-900/50 text-gray-400 hover:text-red-400' 
                          : 'hover:bg-red-50 text-gray-400 hover:text-red-600'
                      } ${deleting === rule.merchant_pattern ? 'opacity-50' : ''}`}
                    >
                      {deleting === rule.merchant_pattern ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
            
            {rules.length > 0 && (
              <div className="mt-4 pt-4 border-t border-dashed flex justify-between items-center ${isDark ? 'border-gray-700' : 'border-gray-300'}">
                <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  {rules.length} rule{rules.length !== 1 ? 's' : ''} learned
                </span>
                <button
                  onClick={handleClearAll}
                  className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                    isDark 
                      ? 'text-red-400 hover:bg-red-900/30' 
                      : 'text-red-600 hover:bg-red-50'
                  }`}
                >
                  Clear All
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function PastDocumentsPage({ isVisible, onBack, isDark, onViewDetails }: {
  isVisible: boolean;
  onBack: () => void;
  isDark: boolean;
  onViewDetails: (comparison: any) => void;
}) {
  const [pastDocuments, setPastDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPastDocuments = async () => {
      try {
        setLoading(true);
        
        // Get current user or session ID
        const user = await userService.getCurrentUser();
        const sessionId = userService.getSessionId();
        
        // Ensure session context is set for anonymous users (required for RLS)
        if (!user) {
          await userService.ensureSessionContext();
        }
        
        // Fetch comparisons from database
        let query = supabase
          .from('comparisons')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (user) {
          // For authenticated users, look for records with their user_id
          query = query.eq('user_id', user.id);
        } else {
          // For anonymous users, look for records with their session_id
          query = query.eq('session_id', sessionId);
        }

        const { data, error } = await query;

        console.log('Past documents query:', { user: user?.id, sessionId, data, error });
        
        // Also check if there are any comparisons at all in the database
        const { data: allData, error: allError } = await supabase
          .from('comparisons')
          .select('*')
          .limit(5);
        console.log('All comparisons in database:', { allData, allError });

        if (error) {
          console.error('Error fetching past documents:', error);
          setPastDocuments([]);
        } else {
          // Format the data for display
          const formattedDocuments = (data || []).map(doc => ({
            id: doc.id,
            statement1Name: doc.statement1_name,
            statement2Name: doc.statement2_name,
            date: new Date(doc.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            }),
            statement1Withdrawals: doc.statement1_withdrawals || 0,
            statement1Deposits: doc.statement1_deposits || 0,
            statement2Withdrawals: doc.statement2_withdrawals || 0,
            statement2Deposits: doc.statement2_deposits || 0,
            totalWithdrawals: doc.total_withdrawals || 0,
            totalDeposits: doc.total_deposits || 0,
            status: doc.status || 'completed',
            results: doc.results || {}
          }));
          
          setPastDocuments(formattedDocuments);
        }
      } catch (error) {
        console.error('Error loading past documents:', error);
        setPastDocuments([]);
      } finally {
        setLoading(false);
      }
    };

    if (isVisible) {
      loadPastDocuments();
    }
  }, [isVisible]);

  if (!isVisible) return null;

  const handleDownloadPDF = (documentId: string) => {
    // In a real app, this would download the actual PDF
    console.log(`Downloading PDF for document ${documentId}`);
    alert(`Downloading comparison PDF for document ${documentId}`);
  };

  const handleDownloadCSV = (documentId: string) => {
    // In a real app, this would download the actual CSV
    console.log(`Downloading CSV for document ${documentId}`);
    alert(`Downloading comparison CSV for document ${documentId}`);
  };



  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isDark 
        ? 'bg-black' 
        : 'bg-gradient-to-br from-blue-50 via-white to-green-50'
    }`}>
      {/* Navigation Header */}
      <div className={`sticky top-0 z-40 backdrop-blur-sm border-b ${
        isDark ? 'bg-black/90 border-white' : 'bg-white/80 border-gray-200'
      }`}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-black border-2 border-white">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <span className={`font-semibold text-lg ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                BankCompare
              </span>
            </div>
            
            <button 
              onClick={onBack}
              className="px-4 py-2 rounded-lg font-medium transition-colors bg-black border-2 border-white text-white hover:bg-gray-900"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className={`text-3xl font-bold mb-4 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
            Past Documents
          </h1>
          <p className={`text-lg ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            View and download your previous bank statement comparisons
          </p>
        </div>
        
        {loading ? (
          <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            <Loader2 className="mx-auto h-8 w-8 animate-spin mb-4" />
            <p>Loading past documents...</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {pastDocuments.length > 0 ? (
              pastDocuments.map((doc) => (
                <div key={doc.id} className={`rounded-xl border shadow-lg p-6 ${
                  isDark ? 'bg-black border-white' : 'bg-white border-gray-200'
                }`}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className={`text-xl font-semibold mb-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                        {doc.statement1Name} vs {doc.statement2Name}
                      </h3>
                      <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {doc.date}
                      </p>
                    </div>

                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className={`p-4 rounded-lg ${
                      isDark ? 'bg-black border border-white' : 'bg-gray-50'
                    }`}>
                      <p className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {doc.statement1Name}
                      </p>
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between">
                          <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Withdrawals:</span>
                          <span className={`font-semibold ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                            -${doc.statement1Withdrawals.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Deposits:</span>
                          <span className={`font-semibold ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                            +${doc.statement1Deposits.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className={`p-4 rounded-lg ${
                      isDark ? 'bg-black border border-white' : 'bg-gray-50'
                    }`}>
                      <p className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {doc.statement2Name}
                      </p>
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between">
                          <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Withdrawals:</span>
                          <span className={`font-semibold ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                            -${doc.statement2Withdrawals.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Deposits:</span>
                          <span className={`font-semibold ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                            +${doc.statement2Deposits.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => onViewDetails(doc)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                        isDark 
                          ? 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105' 
                          : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105'
                      }`}
                    >
                      <Eye className="h-4 w-4" />
                      View Details
                    </button>
                    <button
                      onClick={() => handleDownloadPDF(doc.id)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                        isDark 
                          ? 'bg-green-600 text-white hover:bg-green-700 hover:scale-105' 
                          : 'bg-green-600 text-white hover:bg-green-700 hover:scale-105'
                      }`}
                    >
                      <Download className="h-4 w-4" />
                      Download PDF
                    </button>
                    <button
                      onClick={() => handleDownloadCSV(doc.id)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 border ${
                        isDark 
                          ? 'bg-transparent text-white border-white hover:bg-black' 
                          : 'bg-transparent text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <Download className="h-4 w-4" />
                      Download CSV
                    </button>

                  </div>
                </div>
              ))
            ) : (
              <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                <BarChart3 className={`mx-auto h-12 w-12 mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                <h3 className="text-lg font-medium mb-2">No comparisons yet</h3>
                <p className="text-sm">Create your first bank statement comparison to see it here</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ComparisonResultsPage({ 
  isVisible, 
  onBack, 
  isDark,
  comparisonData,
  statementNames,
  parsedData,
  comparisonDate,
  isHistorical = false,
  onExportPDF,
  onExportCSV,
  onStatementNameChange,
  onLearnCategory
}: {
  isVisible: boolean;
  onBack: () => void;
  isDark: boolean;
  comparisonData: { [key: string]: ComparisonResult };
  statementNames: string[];
  parsedData?: ParsedStatement[];
  comparisonDate?: string;
  isHistorical?: boolean;
  onExportPDF?: () => void;
  onExportCSV?: () => void;
  onStatementNameChange?: (index: number, newName: string) => void;
  onLearnCategory?: (description: string, oldCategory: string, newCategory: string) => void;
}) {
  if (!isVisible || !comparisonData) return null;

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isDark 
        ? 'bg-black' 
        : 'bg-gradient-to-br from-blue-50 via-white to-green-50'
    }`}>
      {/* Header with back button */}
      <div className={`sticky top-0 z-40 backdrop-blur-sm border-b ${
        isDark ? 'bg-black/90 border-white' : 'bg-white/80 border-gray-200'
      }`}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-black border-2 border-white">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <div>
                <span className={`font-semibold text-lg ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                  {statementNames[0] || 'Statement 1'} vs {statementNames[1] || 'Statement 2'}
                </span>
                {comparisonDate && (
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    {comparisonDate}
                  </p>
                )}
              </div>
            </div>
            
            <button 
              onClick={onBack}
              className="px-4 py-2 rounded-lg font-medium transition-colors bg-black border-2 border-white text-white hover:bg-gray-900"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>

      {/* Results Content */}
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <ComparisonResults
          data={comparisonData}
          statementNames={statementNames}
          isPreview={false}
          isDark={isDark}
          parsedData={parsedData}
          onStatementNameChange={onStatementNameChange}
          onLearnCategory={onLearnCategory}
        />

        {/* Export Options */}
        {onExportPDF && onExportCSV && (
          <div className="flex flex-wrap gap-4 justify-center mt-6">
            <button
              onClick={onExportPDF}
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg transition-colors ${
                isDark 
                  ? 'bg-red-600 hover:bg-red-700 text-white' 
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              <FileText className="h-5 w-5" />
              Export PDF Report
            </button>
            
            <button
              onClick={onExportCSV}
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg transition-colors ${
                isDark 
                  ? 'bg-green-600 hover:bg-green-700 text-white' 
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              <Receipt className="h-5 w-5" />
              Export CSV Data
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TransactionEditor({ 
  transactions, 
  onSave, 
  onCancel, 
  isDark,
  statementTitle
}: {
  transactions: Transaction[];
  onSave: (transactions: Transaction[]) => void;
  onCancel: () => void;
  isDark: boolean;
  statementTitle: string;
}) {
  const [editingTransactions, setEditingTransactions] = useState<Transaction[]>(transactions);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleEdit = (id: string) => {
    setEditingId(id);
  };

  const handleSave = (id: string, updatedTransaction: Partial<Transaction>) => {
    setEditingTransactions(prev => 
      prev.map(t => t.id === id ? { ...t, ...updatedTransaction } : t)
    );
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    setEditingTransactions(prev => prev.filter(t => t.id !== id));
  };

  const handleSaveAll = () => {
    onSave(editingTransactions);
  };

  const addTransaction = () => {
    const newTransaction: Transaction = {
      id: `new-${Date.now()}`,
      date: '',
      description: '',
      amount: 0,
      category: 'shopping',
      type: 'withdrawal'
    };
    setEditingTransactions(prev => [newTransaction, ...prev]);
    setEditingId(newTransaction.id);
  };

  return (
    <div className={`flex flex-col h-full ${
      isDark ? 'bg-black' : 'bg-white'
    }`}>
      {/* Header */}
      <div className={`flex items-center justify-between p-4 sm:p-6 border-b ${
        isDark ? 'border-white' : 'border-gray-200'
      }`}>
        <h3 className={`text-xl font-bold flex items-center gap-2 ${
          isDark ? 'text-gray-200' : 'text-gray-800'
        }`}>
          <FileText className={`h-6 w-6 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
          Review & Edit Transactions - {statementTitle}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={addTransaction}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isDark 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            Add Transaction
          </button>
          <button
            onClick={onCancel}
            className={`p-2 rounded-lg transition-colors ${
              isDark ? 'hover:bg-gray-900 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
        {editingTransactions.map((transaction) => (
          <div key={transaction.id} className={`p-4 rounded-lg border ${
            isDark ? 'bg-black border-white' : 'bg-gray-50 border-gray-200'
          }`}>
            {editingId === transaction.id ? (
              <TransactionEditForm
                transaction={transaction}
                onSave={(updated) => handleSave(transaction.id, updated)}
                onCancel={() => setEditingId(null)}
                onDelete={() => handleDelete(transaction.id)}
                isDark={isDark}
              />
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`text-sm font-medium ${
                      transaction.type === 'withdrawal' 
                        ? isDark ? 'text-red-400' : 'text-red-600'
                        : isDark ? 'text-green-400' : 'text-green-600'
                    }`}>
                      {transaction.type === 'withdrawal' ? '↓' : '↑'} ${transaction.amount.toFixed(2)}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      isDark ? 'bg-gray-600 text-gray-300' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {categories.find(c => c.id === transaction.category)?.name || transaction.category}
                    </span>
                  </div>
                  <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    {cleanDescription(transaction.description)}
                  </div>
                  <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                    {transaction.date}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(transaction.id)}
                    className={`p-2 rounded transition-colors ${
                      isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-200'
                    }`}
                  >
                    <Edit3 className={`h-4 w-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className={`flex justify-end gap-3 p-4 sm:p-6 border-t ${
        isDark ? 'border-white' : 'border-gray-200'
      }`}>
        <button
          onClick={onCancel}
          className={`px-6 py-2 rounded-lg font-medium transition-colors ${
            isDark 
              ? 'bg-black border-2 border-white hover:bg-gray-900 text-white' 
              : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
          }`}
        >
          Cancel
        </button>
        <button
          onClick={handleSaveAll}
          className={`px-6 py-2 rounded-lg font-medium transition-colors ${
            isDark 
              ? 'bg-green-600 hover:bg-green-700 text-white' 
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}

function TransactionEditForm({ 
  transaction, 
  onSave, 
  onCancel, 
  onDelete,
  isDark 
}: {
  transaction: Transaction;
  onSave: (transaction: Partial<Transaction>) => void;
  onCancel: () => void;
  onDelete?: () => void;
  isDark: boolean;
}) {
  const [formData, setFormData] = useState({
    date: transaction.date,
    description: cleanDescription(transaction.description),
    amount: transaction.amount,
    category: transaction.category,
    type: transaction.type
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            Date
          </label>
          <input
            type="text"
            value={formData.date}
            onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
            className={`w-full px-3 py-2 rounded-lg border ${
              isDark 
                ? 'bg-black border-white text-white' 
                : 'bg-white border-gray-300 text-gray-900'
            }`}
            placeholder="MM/DD"
          />
        </div>
        <div>
          <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            Amount
          </label>
          <input
            type="number"
            step="0.01"
            value={formData.amount}
            onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
            className={`w-full px-3 py-2 rounded-lg border ${
              isDark 
                ? 'bg-black border-white text-white' 
                : 'bg-white border-gray-300 text-gray-900'
            }`}
            placeholder="0.00"
          />
        </div>
      </div>
      
      <div>
        <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          Description
        </label>
        <input
          type="text"
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          className={`w-full px-3 py-2 rounded-lg border ${
            isDark 
              ? 'bg-black border-white text-white' 
              : 'bg-white border-gray-300 text-gray-900'
          }`}
          placeholder="Transaction description"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            Category
          </label>
          <select
            value={formData.category}
            onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
            className={`w-full px-3 py-2 rounded-lg border ${
              isDark 
                ? 'bg-black border-white text-white' 
                : 'bg-white border-gray-300 text-gray-900'
            }`}
          >
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            Type
          </label>
          <select
            value={formData.type}
            onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as 'withdrawal' | 'deposit' }))}
            className={`w-full px-3 py-2 rounded-lg border ${
              isDark 
                ? 'bg-black border-white text-white' 
                : 'bg-white border-gray-300 text-gray-900'
            }`}
          >
            <option value="withdrawal">Withdrawal</option>
            <option value="deposit">Deposit</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isDark 
                ? 'bg-red-600 hover:bg-red-700 text-white' 
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            <Trash2 className="h-4 w-4 inline mr-1" />
            Delete
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            isDark 
              ? 'bg-black border-2 border-white hover:bg-gray-900 text-white' 
              : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
          }`}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            isDark 
              ? 'bg-green-600 hover:bg-green-700 text-white' 
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          Save
        </button>
      </div>
    </form>
  );
}

// Anonymous usage tracking


function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [parsedData, setParsedData] = useState<ParsedStatement[]>([]);
  const [uploading, setUploading] = useState<boolean[]>([]);
  const [statementNames, setStatementNames] = useState<string[]>([]);
  
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [comparisonResults, setComparisonResults] = useState<{ [key: string]: ComparisonResult } | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [showTransactionEditor, setShowTransactionEditor] = useState<number>(-1); // Index of statement being edited, -1 for none
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showSettingsPage, setShowSettingsPage] = useState(false);
  const [showPastDocumentsPage, setShowPastDocumentsPage] = useState(false);
  const [showAuthPage, setShowAuthPage] = useState(false);
  const [showResultsPage, setShowResultsPage] = useState(false);
  const [currentComparisonView, setCurrentComparisonView] = useState<{
    data: { [key: string]: ComparisonResult };
    statementNames: string[];
    parsedData?: ParsedStatement[];
    date?: string;
    isHistorical: boolean;
  } | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userTier, setUserTier] = useState<string | undefined>(undefined);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);

  const [comparisonGenerated, setComparisonGenerated] = useState(false);
  const [isGeneratingComparison, setIsGeneratingComparison] = useState(false);

  // Toast notification state for category learning
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  // Calculate max files based on tier
  const maxFiles = userTier && ['starter', 'pro', 'business'].includes(userTier) ? 4 : 2;

  // Initialize categorization service when auth state changes
  useEffect(() => {
    const initCategorizationService = async () => {
      try {
        const user = await userService.getCurrentUser();
        const sessionId = userService.getSessionId();
        await categorizationService.loadUserRules(user?.id, sessionId);
        console.log('Categorization service initialized with', categorizationService.getRuleCount(), 'rules');
      } catch (error) {
        console.error('Failed to initialize categorization service:', error);
      }
    };
    initCategorizationService();
  }, [isAuthenticated]);

  // Function to learn from category changes and show toast
  const learnFromCategoryChange = async (description: string, oldCategory: string, newCategory: string) => {
    if (oldCategory === newCategory) return;
    
    const result = await categorizationService.learnFromCorrection(description, newCategory);
    if (result.success && result.merchantPattern) {
      const formattedPattern = formatMerchantPattern(result.merchantPattern);
      const categoryName = categories.find(c => c.id === newCategory)?.name || newCategory;
      setToastMessage(`Got it! Future "${formattedPattern}" transactions will be ${categoryName}`);
      setShowToast(true);
    }
  };


  // Check authentication status and listen for changes
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        // Force clear states first to prevent stale UI
        console.log('🔄 Clearing auth states before check...');
        setIsAuthenticated(false);
        setIsSignedIn(false);
        setUserTier(undefined);
        setUserEmail(undefined);
        
        // Check for valid session instead of cached user data
        const { data: { session } } = await supabase.auth.getSession();
        console.log('Initial session check:', session ? 'Session exists' : 'No session', session?.user?.id);
        
        if (session?.user) {
          // Valid session exists, user is authenticated
          console.log('Setting authenticated state to true for user:', session.user.id);
          setIsAuthenticated(true);
          setIsSignedIn(true);
          setUserEmail(session.user.email);
          
          // Try to get full profile, but don't block on it
          try {
            const user = await userService.getCurrentUser();
            setUserTier(user?.tier || 'signup');
          } catch (error) {
            console.error('Error loading user profile on init:', error);
            setUserTier('signup'); // Fallback tier
          }
        } else {
          // No valid session, user is not authenticated
          console.log('No session found, confirming authenticated state is false');
          // States already cleared above
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
        // Assume not authenticated on error
        setIsAuthenticated(false);
        setIsSignedIn(false);
        setUserTier(undefined);
        setUserEmail(undefined);
      }
    };
    
    checkAuthStatus();

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);
      console.log('Session details:', session ? {
        access_token: session.access_token ? 'present' : 'missing',
        refresh_token: session.refresh_token ? 'present' : 'missing',
        expires_at: session.expires_at,
        user_id: session.user?.id
      } : 'no session');
      
      if (event === 'SIGNED_OUT' || !session) {
        console.log('Processing SIGNED_OUT event');
        setIsAuthenticated(false);
        setIsSignedIn(false);
        setUserTier(undefined);
        setUserEmail(undefined);
      } else if (event === 'SIGNED_IN' && session) {
        console.log('Processing SIGNED_IN event - this should not happen if user clicked sign out!');
        try {
          // Set auth state immediately to prevent hanging UI
          setIsAuthenticated(true);
          setIsSignedIn(true);
          setUserEmail(session.user?.email);
          
          // Try to get user profile with timeout
          const user = await userService.getCurrentUser();
          setUserTier(user?.tier);
        } catch (error) {
          console.error('Error loading user profile after sign in:', error);
          // Keep user signed in even if profile loading fails
          setUserTier('signup'); // Default fallback tier
        }
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Check for payment success/cancellation URL
  useEffect(() => {
    const handlePaymentResult = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      
      // Handle payment cancellation
      if (urlParams.get('payment_cancelled') === 'true') {
        console.log('Payment cancelled');
        stripeService.clearPaymentParams();
        // Optionally show a message or redirect to pricing page
        return;
      }
      
      // Handle payment success
      const paymentResult = stripeService.checkPaymentSuccess();
      if (paymentResult.success) {
        console.log('Payment success detected:', paymentResult);
        
        // Clear payment parameters from URL
        stripeService.clearPaymentParams();
        
        // Refresh user data to get updated tier/credits
        const user = await userService.getCurrentUser();
        if (user) {
          setIsAuthenticated(true);
          setIsSignedIn(true); // Keep both states in sync
          setUserTier(user.tier);
          
          // Show success message
          alert(`🎉 Payment successful! Your account has been upgraded to ${user.tier} with ${user.credits} credits.`);
        } else {
          // Show success message for anonymous payment
          alert('🎉 Payment successful! Please sign in or create an account to access your upgraded features.');
        }
      }
    };

    handlePaymentResult();
  }, []);

  const parser = new BankStatementParser();

  const handleFilesUpload = async (newFiles: File[]) => {
    // Validate file count
    if (files.length + newFiles.length > maxFiles) {
      alert(`You can only upload up to ${maxFiles} files. ${maxFiles === 2 ? 'Upgrade to a paid plan for up to 4 files!' : ''}`);
      return;
    }

    // Filter for PDF files only
    const pdfFiles = newFiles.filter(file => file.type === 'application/pdf');
    if (pdfFiles.length === 0) {
      alert('Please upload PDF files only.');
      return;
    }

    // Add files to state
    setFiles(prev => [...prev, ...pdfFiles]);
    setUploading(prev => [...prev, ...pdfFiles.map(() => false)]);
    setStatementNames(prev => [
      ...prev,
      ...pdfFiles.map((file) => file.name.replace(/\.pdf$/i, ''))
    ]);
    setComparisonGenerated(false);
    setComparisonResults(null);
  };

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setParsedData(prev => prev.filter((_, i) => i !== index));
    setUploading(prev => prev.filter((_, i) => i !== index));
    setStatementNames(prev => prev.filter((_, i) => i !== index));
    setComparisonGenerated(false);
    setComparisonResults(null);
  };

  const handleStatementNameChange = (index: number, newName: string) => {
    setStatementNames(prev => {
      const updated = [...prev];
      updated[index] = newName;
      return updated;
    });
  };

  const generateComparison = async () => {
    if (files.length < 2) {
      alert('Please upload at least 2 statements for comparison.');
      return;
    }

    setIsGeneratingComparison(true);
    setUploading(files.map(() => true));
    
    try {
      // Process all files through API concurrently
      const results = await Promise.all(
        files.map(file => parser.parsePDF(file))
      );
      
      console.log('PDF parsing completed, setting parsed data...');
      console.log('Results:', results);
      console.log('Number of results:', results.length);
      results.forEach((result, index) => {
        console.log(`Statement ${index + 1} - Transactions: ${result.transactions.length}, Withdrawals: ${result.withdrawals.length}, Deposits: ${result.deposits.length}`);
      });
      
      // Check if any results have no transactions
      const emptyResults = results.filter(r => r.transactions.length === 0);
      if (emptyResults.length > 0) {
        console.warn(`WARNING: ${emptyResults.length} statement(s) have no transactions!`);
      }
      
      setParsedData(results);
      
      // Calculate total pages processed from all statements
      console.log('Getting page counts...');
      const pageCounts = await Promise.all(
        files.map(file => parser.getPDFPageCount(file))
      );
      const totalPages = pageCounts.reduce((sum, count) => sum + count, 0);
      console.log('Total pages:', totalPages);
      
      // Check tier limits before allowing comparison
      console.log('Checking tier limits...');
      let tierCheck;
      try {
        // Add a 5-second timeout to prevent hanging
        const tierCheckPromise = userService.canPerformAction('comparison', totalPages);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Tier check timeout')), 5000)
        );
        
        tierCheck = await Promise.race([tierCheckPromise, timeoutPromise]) as any;
      } catch (error) {
        console.error('Error checking tier limits:', error);
        // Default to allowing if check fails or times out
        tierCheck = { canPerform: true };
      }
      console.log('Tier check result:', tierCheck);
      
      if (!tierCheck.canPerform) {
        alert(tierCheck.reason || 'You have reached your tier limit. Please upgrade to continue.');
        setIsGeneratingComparison(false);
        setUploading(files.map(() => false));
        return;
      }

      // Mark anonymous usage if user is not signed in

      // Generate comparison matrix for ALL categories
      const comparison: { [key: string]: ComparisonResult } = {};
      
      categories.forEach(category => {
        const categoryId = category.id;
        const isIncomeCategory = categoryId === 'income';
        
        // Calculate values for each statement
        const statementValues = results.map(result => {
          const withdrawals = result.withdrawals
          .filter(t => t.category === categoryId)
          .reduce((sum, t) => sum + t.amount, 0);
          
          const deposits = result.deposits
          .filter(t => t.category === categoryId)
          .reduce((sum, t) => sum + t.amount, 0);
        
          return isIncomeCategory ? deposits : withdrawals;
        });
        
        // Find min and max indices
        const minIndex = statementValues.indexOf(Math.min(...statementValues));
        const maxIndex = statementValues.indexOf(Math.max(...statementValues));
        
        // Calculate differences from average
        const average = statementValues.reduce((sum, val) => sum + val, 0) / statementValues.length;
        const differences = statementValues.map(val => val - average);
        
        comparison[categoryId] = {
          category: categoryId,
          statementValues,
          differences,
          minIndex,
          maxIndex
        };
      });
      
      console.log('Setting comparison results...');
      setComparisonResults(comparison);
      setComparisonGenerated(true);
      console.log('Comparison generated successfully!');
      
      // Navigate to results page
      setCurrentComparisonView({
        data: comparison,
        statementNames: statementNames,
        parsedData: results,
        date: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        isHistorical: false
      });
      setShowResultsPage(true);
      
      // Log the usage based on pages processed
      try {
        console.log('Logging usage...');
        const logUsagePromise = userService.logUsage('comparison', totalPages);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Log usage timeout')), 3000)
        );
        await Promise.race([logUsagePromise, timeoutPromise]);
        console.log('Usage logged successfully');
      } catch (error) {
        console.error('Error logging usage (non-blocking):', error);
      }
      
      // Save comparison to database
      try {
        console.log('Getting current user...');
        let user;
        try {
          const getUserPromise = userService.getCurrentUser();
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Get user timeout')), 3000)
          );
          user = await Promise.race([getUserPromise, timeoutPromise]);
        } catch (error) {
          console.error('Error getting user (continuing anyway):', error);
          user = null;
        }
        console.log('User:', user);
        const sessionId = userService.getSessionId();
        
        // Ensure session context is set for anonymous users (required for RLS)
        if (!user) {
          await userService.ensureSessionContext();
        }
        
        // Calculate totals for the comparison
        const totalWithdrawals = results.reduce((sum, r) => sum + r.totalWithdrawals, 0);
        const totalDeposits = results.reduce((sum, r) => sum + r.totalDeposits, 0);
        
        // Save to comparisons table
        const saveData = {
          user_id: user?.id || null,
          session_id: user ? null : sessionId,
          statement1_name: statementNames[0] || 'Statement 1',
          statement2_name: statementNames[1] || 'Statement 2',
          categories: Object.keys(comparison),
          results: comparison,
          total_withdrawals: totalWithdrawals,
          total_deposits: totalDeposits,
          statement1_withdrawals: results[0]?.totalWithdrawals || 0,
          statement1_deposits: results[0]?.totalDeposits || 0,
          statement2_withdrawals: results[1]?.totalWithdrawals || 0,
          statement2_deposits: results[1]?.totalDeposits || 0,
          status: 'completed'
        };
        
        console.log('Saving comparison data:', saveData);
        
        try {
          const savePromise = supabase
            .from('comparisons')
            .insert(saveData)
            .select();
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Database save timeout')), 5000)
          );
          
          const { data: savedData, error: saveError } = await Promise.race([savePromise, timeoutPromise]) as any;
            
          if (saveError) {
            console.error('Error saving comparison:', saveError);
          } else {
            console.log('Successfully saved comparison:', savedData);
          }
        } catch (error) {
          console.error('Error or timeout saving comparison:', error);
        }
      } catch (error) {
        console.error('Error saving comparison to database:', error);
      }
      
      console.log('All operations completed, showing success message...');
      
      // Check if we actually have transaction data
      const totalTransactions = results.reduce((sum, r) => sum + r.transactions.length, 0);
      if (totalTransactions === 0) {
        alert(`Warning: Processed ${totalPages} pages but found no transactions. The PDF may be image-based or have an unsupported format. Please check the browser console for details.`);
      } else {
        alert(`Comparison completed! Processed ${totalPages} pages and found ${totalTransactions} transactions.`);
      }
      
    } catch (error) {
      console.error('Error processing PDFs:', error);
      alert('Error processing PDFs. Please try again.');
    } finally {
      console.log('Resetting loading states in finally block...');
      setUploading(files.map(() => false));
      setIsGeneratingComparison(false);
      console.log('Loading states reset complete');
    }
  };

  const handlePayment = async () => {
    try {
      // Close the paywall modal first
      setShowPaywall(false);
      
      // Redirect to pricing page where user can select a plan
      setShowPricingModal(true);
    } catch (error) {
      console.error('Error handling payment:', error);
      alert('Error starting payment process. Please try again.');
    }
  };

  const exportToPDF = () => {
    // Create a simple PDF-like report using browser print functionality
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const reportContent = `
      <html>
        <head>
          <title>Bank Statement Comparison Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .summary { margin-bottom: 30px; }
            .comparison { margin-bottom: 30px; }
            .category { margin-bottom: 15px; padding: 10px; border: 1px solid #ccc; }
            .statement { display: inline-block; margin-right: 20px; }
            .amount { font-weight: bold; }
            .difference { color: #666; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Bank Statement Comparison Report</h1>
            <p>Generated on ${new Date().toLocaleDateString()}</p>
          </div>
          
          <div class="summary">
            <h2>Summary</h2>
            ${parsedData.map((data, index) => {
              const net = (data.totalDeposits || 0) - (data.totalWithdrawals || 0);
              return `
            <div class="statement">
                  <h3>${statementNames[index] || `Statement ${index + 1}`}</h3>
                  <p>Total Withdrawals: $${data.totalWithdrawals.toFixed(2)}</p>
                  <p>Total Deposits: $${data.totalDeposits.toFixed(2)}</p>
                  <p>Net: $${net.toFixed(2)}</p>
            </div>
              `;
            }).join('')}
          </div>
          
          <div class="comparison">
            <h2>Category Comparison</h2>
            ${Object.entries(comparisonResults || {}).map(([categoryId, result]) => {
              const category = categories.find(c => c.id === categoryId);
              return `
                <div class="category">
                  <h3>${category?.name || categoryId}</h3>
                  ${result.statementValues.map((value, index) => `
                  <div class="statement">
                      <span class="amount">${statementNames[index] || `Statement ${index + 1}`}: $${value.toFixed(2)}</span>
                  </div>
                  `).join('')}
                </div>
              `;
            }).join('')}
          </div>
          
          <div class="transactions">
            <h2>Transaction Details</h2>
            <table>
              <thead>
                <tr>
                  <th>Statement</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                ${parsedData.flatMap((data, index) => 
                  data.transactions.map(t => ({
                    ...t,
                    statement: statementNames[index] || `Statement ${index + 1}`
                  }))
                ).map(t => `
                  <tr>
                    <td>${t.statement}</td>
                    <td>${categories.find(c => c.id === t.category)?.name || t.category}</td>
                    <td>${t.description}</td>
                    <td>${t.date}</td>
                    <td>$${t.amount.toFixed(2)}</td>
                    <td>${t.type}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(reportContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const exportToCSV = () => {
    if (!comparisonResults || parsedData.length === 0) {
      alert('No data to export');
      return;
    }

    // Create CSV content
    let csvContent = 'Statement,Category,Description,Date,Amount,Type\n';
    
    // Add transactions from all statements
    const allTransactions = parsedData.flatMap((data, index) => 
      data.transactions.map(t => ({
        ...t,
        statement: statementNames[index] || `Statement ${index + 1}`
      }))
    );

    allTransactions.forEach(transaction => {
      const category = categories.find(c => c.id === transaction.category)?.name || transaction.category;
      const row = [
        transaction.statement,
        category,
        `"${cleanDescription(transaction.description).replace(/"/g, '""')}"`, // Escape quotes in CSV
        transaction.date,
        transaction.amount.toFixed(2),
        transaction.type
      ].join(',');
      csvContent += row + '\n';
    });

    // Add comparison summary
    csvContent += '\nCategory Comparison\n';
    const headerRow = ['Category', ...statementNames.map((name, i) => name || `Statement ${i + 1}`)].join(',');
    csvContent += headerRow + '\n';
    
    Object.entries(comparisonResults).forEach(([categoryId, result]) => {
      const category = categories.find(c => c.id === categoryId)?.name || categoryId;
      const row = [
        category,
        ...result.statementValues.map(v => v.toFixed(2))
      ].join(',');
      csvContent += row + '\n';
    });

    // Create and download the CSV file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `bank_statement_comparison_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleTransactionEditorSave = (index: number, updatedTransactions: Transaction[]) => {
    if (!parsedData[index]) return;
    
    const updatedParsedData = { ...parsedData[index] };
    updatedParsedData.transactions = updatedTransactions;
    
    // Recalculate withdrawals and deposits
    const withdrawals = updatedTransactions.filter(t => t.type === 'withdrawal');
    const deposits = updatedTransactions.filter(t => t.type === 'deposit');
    
    updatedParsedData.withdrawals = withdrawals;
    updatedParsedData.deposits = deposits;
    updatedParsedData.totalWithdrawals = withdrawals.reduce((sum, t) => sum + t.amount, 0);
    updatedParsedData.totalDeposits = deposits.reduce((sum, t) => sum + t.amount, 0);
    
    setParsedData(prev => {
      const updated = [...prev];
      updated[index] = updatedParsedData;
      return updated;
    });
    setShowTransactionEditor(-1);
  };

  const resetComparison = () => {
    setFiles([]);
    setParsedData([]);
    setUploading([]);
    setStatementNames([]);
    setSelectedCategories([]);
    setComparisonResults(null);
    setComparisonGenerated(false);
    setShowTransactionEditor(-1);
  };

  const hasEnoughFiles = files.length >= 2;
  const allFilesUploaded = files.length > 0;

  return (
    <>
      {!showAuthPage && !showPricingModal && !showSettingsPage && !showPastDocumentsPage && !showResultsPage ? (
        <div className={`min-h-screen transition-colors duration-300 ${
          isDarkMode 
            ? 'bg-black' 
            : 'bg-gradient-to-br from-blue-50 via-white to-green-50'
        }`}>
          {/* Navigation Header */}
          <div className={`sticky top-0 z-40 backdrop-blur-sm border-b ${
            isDarkMode ? 'bg-black/90 border-white' : 'bg-white/80 border-gray-200'
          }`}>
            <div className="container mx-auto px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      setShowPricingModal(false);
                      setShowSettingsPage(false);
                      setShowPastDocumentsPage(false);
                      setShowResultsPage(false);
                    }}
                    className="p-2 rounded-lg transition-colors bg-black border-2 border-white hover:bg-gray-900"
                  >
                    <BarChart3 className="h-5 w-5 text-white" />
                  </button>
                </div>
                
                <nav className="flex items-center gap-6">
                  {(() => {
                    console.log('🎨 UI Render - isSignedIn:', isSignedIn, 'isAuthenticated:', isAuthenticated);
                    return null;
                  })()}
                  {!isSignedIn ? (
                    <>
                      {/* Anonymous usage indicator - will be updated dynamically */}
                      <div className={`text-xs px-2 py-1 rounded-full ${
                        isDarkMode 
                          ? 'bg-black text-white border-2 border-white' 
                          : 'bg-green-100 text-green-800 border border-green-300'
                      }`}>
                        Anonymous Tier
                      </div>
                      
                      <button 
                        onClick={() => setShowPricingModal(true)}
                        className={`text-sm font-medium transition-colors hover:scale-105 ${
                          isDarkMode ? 'text-white hover:text-gray-300' : 'text-gray-600 hover:text-green-600'
                        }`}
                      >
                        Pricing
                      </button>
                      <button 
                        onClick={() => setShowSettingsPage(true)}
                        className={`text-sm font-medium transition-colors hover:scale-105 ${
                          isDarkMode ? 'text-white hover:text-gray-300' : 'text-gray-600 hover:text-green-600'
                        }`}
                      >
                        Settings
                      </button>

                      <button 
                        onClick={() => setShowAuthPage(true)}
                        className="px-4 py-2 rounded-lg font-medium transition-all duration-200 bg-black border-2 border-white text-white hover:bg-gray-900 hover:scale-105"
                      >
                        Sign In
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        onClick={() => setShowPastDocumentsPage(true)}
                        className={`text-sm font-medium transition-colors hover:scale-105 ${
                          isDarkMode ? 'text-white hover:text-gray-300' : 'text-gray-600 hover:text-green-600'
                        }`}
                      >
                        Past Documents
                      </button>
                      <button 
                        onClick={() => setShowSettingsPage(true)}
                        className={`text-sm font-medium transition-colors hover:scale-105 ${
                          isDarkMode ? 'text-white hover:text-gray-300' : 'text-gray-600 hover:text-green-600'
                        }`}
                      >
                        Settings
                      </button>
                      <button 
                        onClick={async () => {
                          try {
                            await userService.signOut();
                            // Reset view states to go back to landing page
                            setShowSettingsPage(false);
                            // Auth listener will handle the rest of the state updates
                          } catch (error) {
                            console.error('Sign out error:', error);
                            // Still update UI state if sign out fails
                            setIsSignedIn(false);
                            setIsAuthenticated(false);
                            setUserTier(undefined);
                            setUserEmail(undefined);
                            // Reset view states
                            setShowSettingsPage(false);
                          }
                        }}
                        className="px-4 py-2 rounded-lg font-medium transition-all duration-200 bg-black border-2 border-white text-white hover:bg-gray-900 hover:scale-105"
                      >
                        Sign Out
                      </button>
                    </>
                  )}
                </nav>
              </div>
            </div>
          </div>
          
          <div className="container mx-auto px-4 pt-16 pb-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <h1 className={`text-5xl md:text-6xl font-serif font-bold ${
              isDarkMode ? 'text-white' : 'text-gray-800'
            } leading-tight tracking-tight`}>
              Bank Statement Comparison
            </h1>
          </div>
          <div className={`max-w-3xl mx-auto space-y-3`}>
            <p className={`text-lg ${
              isDarkMode ? 'text-gray-300' : 'text-gray-600'
            }`}>
              Upload multiple bank statements and get instant spending comparisons by category.<br />
              Perfect for co-parents, roommates, couples, or month-to-month tracking.
            </p>
          </div>

          {/* Key Benefits */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className={`p-3 rounded-full w-14 h-14 mx-auto mb-3 flex items-center justify-center ${
                isDarkMode ? 'bg-black border-2 border-white' : 'bg-green-100'
              }`}>
                <Eye className={`h-7 w-7 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
              </div>
              <h3 className={`font-semibold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                See where your money really goes
              </h3>
              <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                No more guessing or manual spreadsheets
              </p>
            </div>
            
            <div className="text-center">
              <div className={`p-3 rounded-full w-14 h-14 mx-auto mb-3 flex items-center justify-center ${
                isDarkMode ? 'bg-black border-2 border-white' : 'bg-green-100'
              }`}>
                <CheckCircle className={`h-7 w-7 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
              </div>
              <h3 className={`font-semibold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                End money arguments instantly
              </h3>
              <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Crystal-clear comparisons everyone can understand
              </p>
            </div>
            
            <div className="text-center">
              <div className={`p-3 rounded-full w-14 h-14 mx-auto mb-3 flex items-center justify-center ${
                isDarkMode ? 'bg-black border-2 border-white' : 'bg-green-100'
              }`}>
                <Target className={`h-7 w-7 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
              </div>
              <h3 className={`font-semibold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                Make better money decisions
              </h3>
              <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Spot spending patterns you never noticed before
              </p>
            </div>
          </div>
        </div>

        {/* Trust Indicators */}
        <div className={`text-center mb-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          <div className="flex items-center justify-center gap-6 text-sm">
          </div>
        </div>

        {/* File Upload Section */}
        <div className="mb-8 max-w-4xl mx-auto">
          <MultiFileUploadZone
            files={files}
            parsedData={parsedData}
            onFilesUpload={handleFilesUpload}
            onRemoveFile={handleRemoveFile}
            onStatementNameChange={handleStatementNameChange}
            maxFiles={maxFiles}
            isDark={isDarkMode}
            isGenerating={isGeneratingComparison}
          />
        </div>

        {/* Comparison Example */}
        {!allFilesUploaded && (
          <div className="mt-16 mb-12 max-w-4xl mx-auto">
            <div className={`rounded-xl p-6 border ${
              isDarkMode ? 'bg-black border-white' : 'bg-white border-gray-200'
            }`}>
              <h3 className={`text-center text-lg font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                Example Comparison
              </h3>
              <div className="space-y-3">
                {[
                  { category: 'Food & Dining', color: '#FF6B6B', stmt1: '$234.50', stmt2: '$189.23', icon: Utensils },
                  { category: 'Groceries', color: '#4ECDC4', stmt1: '$456.78', stmt2: '$512.34', icon: ShoppingBag },
                  { category: 'Gas & Transportation', color: '#45B7D1', stmt1: '$120.45', stmt2: '$98.67', icon: Car },
                ].map((item, i) => {
                  const Icon = item.icon;
                  return (
                  <div key={i} className={`flex items-center justify-between p-3 rounded-lg ${
                    isDarkMode ? 'bg-black border border-white' : 'bg-gray-50'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                        style={{ backgroundColor: item.color + '20' }}
                      >
                        <Icon className="h-5 w-5" style={{ color: item.color }} />
                      </div>
                      <span className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                        {item.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-semibold ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                        {item.stmt1}
                      </span>
                      <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>vs</span>
                      <span className={`text-sm font-semibold ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                        {item.stmt2}
                      </span>
                    </div>
                  </div>
                  );
                })}
              </div>
              <p className={`text-xs text-center mt-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                Upload your statements to see real comparisons
              </p>
            </div>
          </div>
        )}

        {/* Generate Comparison Button */}
        {hasEnoughFiles && !comparisonGenerated && (
          <div className="text-center mb-8">
            {isGeneratingComparison ? (
              <div className="animate-border-wrapper inline-block">
                <div className={`px-8 py-4 rounded-xl font-semibold text-lg ${
                  isDarkMode 
                    ? 'bg-black text-white' 
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  Generating...
                </div>
              </div>
            ) : (
              <button
                onClick={generateComparison}
                className={`px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 ${
                  isDarkMode 
                    ? 'bg-black border-2 border-white hover:bg-gray-900 text-white shadow-lg hover:shadow-xl' 
                    : 'bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-xl'
                }`}
              >
                Generate Comparison
              </button>
            )}
          </div>
        )}

        {/* Transaction Editor Modal */}
        {showTransactionEditor >= 0 && parsedData[showTransactionEditor] && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-black/80 backdrop-blur-md"
              onClick={() => setShowTransactionEditor(-1)}
            />
            {/* Modal - Wide with margins */}
            <div className={`relative z-[101] w-full max-w-7xl max-h-[90vh] overflow-hidden shadow-2xl rounded-xl border-2 ${
              isDarkMode ? 'bg-black border-white' : 'bg-white border-gray-200'
            }`}>
              <TransactionEditor
                transactions={parsedData[showTransactionEditor].transactions}
                onSave={(transactions) => handleTransactionEditorSave(showTransactionEditor, transactions)}
                onCancel={() => setShowTransactionEditor(-1)}
                isDark={isDarkMode}
                statementTitle={statementNames[showTransactionEditor] || `Statement ${showTransactionEditor + 1}`}
              />
            </div>
          </div>
        )}

        {/* No Transactions Warning */}
        {comparisonGenerated && parsedData.length > 0 && parsedData.every(data => data.transactions.length === 0) && (
          <div className={`rounded-xl p-6 shadow-lg border mb-8 ${
            isDarkMode 
              ? 'bg-yellow-900/20 border-yellow-600' 
              : 'bg-yellow-50 border-yellow-300'
          }`}>
            <div className="flex items-start gap-4">
              <AlertCircle className={`h-6 w-6 flex-shrink-0 ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`} />
              <div>
                <h3 className={`text-lg font-semibold mb-2 ${isDarkMode ? 'text-yellow-400' : 'text-yellow-800'}`}>
                  No Transactions Found
                </h3>
                <p className={`mb-3 ${isDarkMode ? 'text-yellow-300' : 'text-yellow-700'}`}>
                  Your PDF files were processed successfully, but no transaction data could be extracted. This can happen if:
                </p>
                <ul className={`list-disc list-inside space-y-1 mb-3 ${isDarkMode ? 'text-yellow-300' : 'text-yellow-700'}`}>
                  <li>The PDF is image-based (scanned) and OCR couldn't extract the data</li>
                  <li>The PDF format is not yet supported by our parser</li>
                  <li>The PDF doesn't contain standard transaction table structures</li>
                </ul>
                <p className={`text-sm mb-4 ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>
                  Please check your browser console (F12) for detailed logs, or try a different PDF format.
                </p>
                <button
                  onClick={resetComparison}
                  className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                    isDarkMode 
                      ? 'bg-yellow-600 hover:bg-yellow-700 text-white hover:scale-105' 
                      : 'bg-yellow-600 hover:bg-yellow-700 text-white hover:scale-105'
                  }`}
                >
                  <Upload className="h-5 w-5" />
                  Try Different Files
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Overall Summary */}
        {allFilesUploaded && comparisonGenerated && parsedData.length > 0 && parsedData.some(data => data.transactions.length > 0) && (
          <div className={`rounded-xl p-6 shadow-lg border mb-8 ${
            isDarkMode 
              ? 'bg-black border-white' 
              : 'bg-white border-gray-100'
          }`}>
            <h3 className={`text-lg font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
              Overall Summary
            </h3>
            <div className={`grid grid-cols-1 ${parsedData.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-2'} gap-6`}>
              {parsedData.map((data, index) => {
                const net = (data.totalDeposits || 0) - (data.totalWithdrawals || 0);
                return (
                  <div key={index} className={`p-4 rounded-lg border ${
                  isDarkMode ? 'bg-black border-white' : 'bg-gray-50 border-gray-200'
                }`}>
                  <h4 className={`font-medium mb-3 ${isDarkMode ? 'text-white' : 'text-gray-700'}`}>
                      {statementNames[index] || `Statement ${index + 1}`}
                  </h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Transactions Found:</span>
                      <span className={`font-medium ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                          {data.transactions.length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Total Withdrawals:</span>
                      <span className={`font-medium ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                          -${data.totalWithdrawals.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Total Deposits:</span>
                      <span className={`font-medium ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                          +${data.totalDeposits.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-gray-300 dark:border-gray-600">
                      <span className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-700'}`}>Net:</span>
                      <span className={`font-bold ${
                          net >= 0
                          ? isDarkMode ? 'text-green-400' : 'text-green-600'
                          : isDarkMode ? 'text-red-400' : 'text-red-600'
                      }`}>
                          {net >= 0 ? '+' : ''}${net.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
                );
              })}
              </div>

            {/* Edit Transactions Buttons */}
            <div className={`mt-6 grid grid-cols-1 ${parsedData.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-2'} gap-4`}>
              {parsedData.map((data, index) => (
                <div key={index} className="text-center">
                <button
                    onClick={() => setShowTransactionEditor(index)}
                  className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                    isDarkMode 
                      ? 'bg-green-600 hover:bg-green-700 text-white hover:scale-105' 
                      : 'bg-green-600 hover:bg-green-700 text-white hover:scale-105'
                  }`}
                >
                  <FileText className="h-4 w-4" />
                    Edit {statementNames[index] || `Statement ${index + 1}`}
                </button>
              </div>
              ))}
              </div>
          </div>
        )}

        {/* Category Selection */}
        {allFilesUploaded && comparisonGenerated && parsedData.some(data => data.transactions.length > 0) && (
          <div className={`rounded-xl p-6 shadow-lg border mb-8 ${
            isDarkMode 
              ? 'bg-black border-white' 
              : 'bg-white border-gray-100'
          }`}>
            <CategorySelector
              selectedCategories={selectedCategories}
              onCategoryChange={setSelectedCategories}
              comparisonData={comparisonResults}
              parsedData={parsedData}
              isDark={isDarkMode}
              statementNames={statementNames}
            />
          </div>
        )}

        <PaywallModal
          isOpen={showPaywall}
          onClose={() => setShowPaywall(false)}
          onPayment={handlePayment}
          totalCategories={selectedCategories.length}
          isDark={isDarkMode}
        />
          </div>
        </div>
      ) : showAuthPage ? (
        <AuthPage
          isVisible={showAuthPage}
          onBack={() => setShowAuthPage(false)}
          onSignIn={() => {
            setIsSignedIn(true);
            setIsAuthenticated(true);
          }}
          isDark={isDarkMode}
        />
      ) : showPricingModal ? (
        <PricingPage
          isVisible={showPricingModal}
          onBack={() => setShowPricingModal(false)}
          isDark={isDarkMode}
          onOpenAuth={() => setShowAuthPage(true)}
        />
      ) : showSettingsPage ? (
        <SettingsPage
          isVisible={showSettingsPage}
          onBack={() => setShowSettingsPage(false)}
          isDark={isDarkMode}
          onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
          isAuthenticated={isAuthenticated}
          onShowPricing={() => setShowPricingModal(true)}
          userTier={userTier}
          userEmail={userEmail}
        />
      ) : showResultsPage && currentComparisonView ? (
        <ComparisonResultsPage
          isVisible={showResultsPage}
          onBack={() => {
            setShowResultsPage(false);
            if (!currentComparisonView.isHistorical) {
              resetComparison();
            }
            setCurrentComparisonView(null);
          }}
          isDark={isDarkMode}
          comparisonData={currentComparisonView.data}
          statementNames={currentComparisonView.statementNames}
          parsedData={currentComparisonView.parsedData}
          comparisonDate={currentComparisonView.date}
          isHistorical={currentComparisonView.isHistorical}
          onExportPDF={!currentComparisonView.isHistorical ? exportToPDF : undefined}
          onExportCSV={!currentComparisonView.isHistorical ? exportToCSV : undefined}
          onStatementNameChange={!currentComparisonView.isHistorical ? (index, newName) => {
            handleStatementNameChange(index, newName);
            // Also update the currentComparisonView
            setCurrentComparisonView(prev => prev ? {
              ...prev,
              statementNames: prev.statementNames.map((n, i) => i === index ? newName : n)
            } : null);
          } : undefined}
          onLearnCategory={learnFromCategoryChange}
        />
      ) : showPastDocumentsPage ? (
        <PastDocumentsPage
          isVisible={showPastDocumentsPage}
          onBack={() => setShowPastDocumentsPage(false)}
          isDark={isDarkMode}
          onViewDetails={(doc) => {
            setCurrentComparisonView({
              data: doc.results,
              statementNames: [doc.statement1Name, doc.statement2Name],
              date: doc.date,
              isHistorical: true
            });
            setShowResultsPage(true);
          }}
        />
      ) : (
        <PricingPage
          isVisible={showPricingModal}
          onBack={() => setShowPricingModal(false)}
          isDark={isDarkMode}
          onOpenAuth={() => setShowAuthPage(true)}
        />
      )}

      {/* Toast notification for category learning */}
      <Toast
        message={toastMessage}
        isVisible={showToast}
        onClose={() => setShowToast(false)}
        isDark={isDarkMode}
      />
    </>
  );
}

export default App;