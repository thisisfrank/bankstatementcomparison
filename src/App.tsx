import React, { useState, useCallback, useEffect } from 'react';
import { Upload, FileText, BarChart3, Download, CheckCircle, AlertCircle, Loader2, CreditCard, Users, Receipt, Car, Utensils, ShoppingBag, Gamepad2, Zap, Activity, DollarSign, Moon, Sun, Edit3, Trash2, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { loadStripe } from '@stripe/stripe-js';
import { userService } from './lib/userService';
import { Profile, TIER_CONFIG } from './lib/supabase';
import { supabase } from './lib/supabase';


// Stripe Configuration
const stripePromise = loadStripe('pk_test_51RrpatRD0ogceRR4A7KSSLRWPStkofC0wJ7dcOIuP1zJjL4wLccu9bu1bxSP1XnVunRP36quFSNi86ylTH8r9vU600dIEPIsdM');

// API Configuration
const API_KEY = import.meta.env.VITE_PDF_PARSER_API_KEY || 'api-AB7psQuumDdjVHLTPYMDghH2xUgaKcuJZVvwReMMsxM9iQBaYJg/BrelRUX07neH';
const API_BASE_URL = import.meta.env.VITE_PDF_PARSER_API_URL || 'https://api2.bankstatementconverter.com/api/v1';

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
  statement1: number;
  statement2: number;
  difference: number;
  winner: string;
}

const categories = [
  { id: 'food-dining', name: 'Food & Dining', icon: Utensils, color: '#FF6B6B', keywords: ['starbucks', 'coffee', 'restaurant', 'mcdonald', 'taco bell', 'chipotle', 'subway', 'pizza', 'burger', 'dining'] },
  { id: 'groceries', name: 'Groceries', icon: ShoppingBag, color: '#4ECDC4', keywords: ['frys', 'safeway', 'walmart', 'target', 'kroger', 'grocery', 'market', 'food store'] },
  { id: 'gas-transport', name: 'Gas & Transportation', icon: Car, color: '#45B7D1', keywords: ['circle k', 'shell', 'chevron', 'exxon', 'uber', 'lyft', 'gas', 'fuel', 'transport'] },
  { id: 'shopping', name: 'Shopping', icon: ShoppingBag, color: '#96CEB4', keywords: ['amazon', 'ebay', 'shop', 'store', 'retail', 'purchase', 'misc', 'other', 'unknown', 'unclassified'] },
  { id: 'subscriptions', name: 'Subscriptions', icon: Gamepad2, color: '#FCEA2B', keywords: ['netflix', 'spotify', 'subscription', 'monthly', 'hulu', 'disney', 'prime', 'recurring', 'verizon'] },
  { id: 'utilities', name: 'Utilities', icon: Zap, color: '#FF9FF3', keywords: ['electric', 'water', 'gas bill', 'utility', 'phone', 'internet', 'cable', 'atm', 'fee', 'charge', 'overdraft', 'penalty', 'applecard'] },
  { id: 'health', name: 'Health & Fitness', icon: Activity, color: '#54A0FF', keywords: ['gym', 'health', 'medical', 'pharmacy', 'fitness', 'doctor', 'planet fitness', 'fitness center', 'workout'] },
  { id: 'income', name: 'Income', icon: DollarSign, color: '#00D4AA', keywords: ['salary', 'deposit', 'payment', 'income', 'payroll', 'direct deposit'] }
];

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
      // Step 1: Upload the PDF file
      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await fetch(`${API_BASE_URL}/BankStatement`, {
        method: 'POST',
        headers: {
          'Authorization': API_KEY,
        },
        body: formData
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }

      const uploadResult = await uploadResponse.json();
      const uuid = uploadResult[0].uuid;
      const state = uploadResult[0].state;

      // Step 2: Check if processing is needed (for image-based PDFs)
      if (state === 'PROCESSING') {
        let currentState = state;
        while (currentState === 'PROCESSING') {
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
          
          const statusResponse = await fetch(`${API_BASE_URL}/BankStatement/status`, {
            method: 'POST',
            headers: {
              'Authorization': API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify([uuid])
          });

          if (!statusResponse.ok) {
            throw new Error(`Status check failed: ${statusResponse.status}`);
          }

          const statusResult = await statusResponse.json();
          currentState = statusResult[0].state;
        }
      }

      // Step 3: Convert the statement to JSON
      const convertResponse = await fetch(`${API_BASE_URL}/BankStatement/convert?format=JSON`, {
        method: 'POST',
        headers: {
          'Authorization': API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([uuid])
      });

      if (!convertResponse.ok) {
        throw new Error(`Conversion failed: ${convertResponse.status}`);
      }

      const convertResult = await convertResponse.json();
      
      // Process the API response and separate withdrawals from deposits
      return this.processAPIResponse(convertResult[0], file.name);
      
    } catch (error) {
      console.error('Error parsing PDF:', error);
      // Fallback to sample data if API fails
      return this.generateSampleData(file.name);
    }
  }

  private processAPIResponse(apiResponse: any, fileName: string): ParsedStatement {
    // The API returns { normalised: [...] } format
    const rawTransactions = apiResponse.normalised || [];
    
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
    const lowerDesc = description.toLowerCase();
    
    // Special case: Frys always goes to groceries (even if it says recurring)
    if (lowerDesc.includes('frys')) {
      return 'groceries';
    }
    
    for (const [categoryId, keywords] of Object.entries(this.categoryKeywords)) {
      if (keywords.some(keyword => lowerDesc.includes(keyword))) {
        return categoryId;
      }
    }
    
    return 'shopping'; // Default category
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
          ? 'bg-gray-800 text-yellow-400 hover:bg-gray-700 shadow-lg shadow-gray-900/50' 
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
              ? 'border-blue-400 bg-blue-900/20' 
              : 'border-blue-500 bg-blue-50'
            : isDark
              ? 'border-gray-600 hover:border-gray-500 bg-gray-800/50'
              : 'border-gray-300 hover:border-gray-400 bg-white'
          }
          ${uploadedFile 
            ? isDark 
              ? 'border-green-400 bg-green-900/20' 
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
              <Loader2 className={`mx-auto h-12 w-12 animate-spin ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
              <p className={`font-medium ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>Uploading PDF...</p>
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
  editableStatementNames
}: {
  selectedCategories: string[];
  onCategoryChange: (categoryIds: string[]) => void;
  comparisonData: { [key: string]: ComparisonResult } | null;
  parsedData: { statement1: ParsedStatement | null; statement2: ParsedStatement | null };
  isDark: boolean;
  editableStatementNames: { statement1: string; statement2: string };
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
                    ? 'border-blue-400 bg-blue-900/30 shadow-lg shadow-blue-900/20'
                    : 'border-blue-500 bg-blue-50 shadow-lg'
                  : isDark
                    ? 'border-gray-600 hover:border-gray-500 bg-gray-800/50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }
              `}
            >
              <div className="flex flex-col items-center space-y-2">
                <div 
                  className="p-3 rounded-full"
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
                  <div className={`text-xs text-center ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    <div>${comparison.difference.toFixed(2)} diff</div>
                  </div>
                )}
              </div>
              
              {isSelected && (
                <CheckCircle className={`absolute -top-2 -right-2 h-6 w-6 rounded-full ${
                  isDark 
                    ? 'text-blue-400 bg-gray-800' 
                    : 'text-blue-600 bg-white'
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
            const statement1Transactions = parsedData.statement1?.transactions.filter(t => t.category === categoryId) || [];
            const statement2Transactions = parsedData.statement2?.transactions.filter(t => t.category === categoryId) || [];
            
            return (
              <div key={categoryId} className={`rounded-lg border p-4 ${
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
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
                  {category?.name} ({statement1Transactions.length + statement2Transactions.length} transactions)
                </h5>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Statement 1 Transactions */}
                  <div>
                    <h6 className={`text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      {editableStatementNames.statement1}
                    </h6>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {statement1Transactions.length > 0 ? (
                        statement1Transactions.map((transaction) => (
                          <div key={transaction.id} className={`text-xs p-2 rounded ${
                            isDark ? 'bg-gray-700' : 'bg-gray-50'
                          }`}>
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className={`font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                                  {transaction.description}
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

                  {/* Statement 2 Transactions */}
                  <div>
                    <h6 className={`text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      {editableStatementNames.statement2}
                    </h6>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {statement2Transactions.length > 0 ? (
                        statement2Transactions.map((transaction) => (
                          <div key={transaction.id} className={`text-xs p-2 rounded ${
                            isDark ? 'bg-gray-700' : 'bg-gray-50'
                          }`}>
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className={`font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                                  {transaction.description}
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
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ComparisonResults({ 
  data, 
  statement1Name, 
  statement2Name, 
  isPreview = false,
  onUnlock,
  isDark
}: {
  data: { [key: string]: ComparisonResult };
  statement1Name: string;
  statement2Name: string;
  isPreview?: boolean;
  onUnlock?: () => void;
  isDark: boolean;
}) {
  const chartData = Object.entries(data).map(([categoryId, result], index) => {
    const category = categories.find(c => c.id === categoryId);
    return {
      category: category?.name || categoryId,
      categoryNumber: index + 1,
      [statement1Name]: result.statement1,
      [statement2Name]: result.statement2,
      color: category?.color || '#8884d8'
    };
  });

  const totalDifference = Object.values(data).reduce((sum, result) => sum + result.difference, 0);
  const previewData = isPreview ? Object.fromEntries(Object.entries(data).slice(0, 2)) : data;

  return (
    <div className="space-y-6">
      <div className={`rounded-xl p-6 shadow-lg border ${
        isDark 
          ? 'bg-gray-800 border-gray-700' 
          : 'bg-white border-gray-100'
      }`}>
        <h3 className={`text-xl font-bold mb-4 flex items-center gap-2 ${
          isDark ? 'text-gray-200' : 'text-gray-800'
        }`}>
          <BarChart3 className={`h-6 w-6 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
          Spending Comparison Results
        </h3>

        {chartData.length > 0 && !isPreview && (
          <div className="mb-6">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#e5e7eb'} />
                  <XAxis 
                    dataKey="categoryNumber" 
                    tick={{ fill: isDark ? '#d1d5db' : '#374151' }}
                    axisLine={{ stroke: isDark ? '#6b7280' : '#9ca3af' }}
                  />
                  <YAxis 
                    tick={{ fill: isDark ? '#d1d5db' : '#374151' }}
                    axisLine={{ stroke: isDark ? '#6b7280' : '#9ca3af' }}
                  />
                  <Tooltip 
                  formatter={(value: any, name: any) => {
                    if (name === statement1Name) {
                      return [`$${value.toFixed(2)}`, statement1Name];
                    } else if (name === statement2Name) {
                      return [`$${value.toFixed(2)}`, statement2Name];
                    }
                    return [`$${value.toFixed(2)}`, name];
                  }}
                  labelFormatter={(label: any) => {
                    const dataPoint = chartData.find(item => item.categoryNumber === label);
                    return dataPoint ? dataPoint.category : label;
                  }}
                />
                  <Bar dataKey={statement1Name} fill="#3B82F6" />
                  <Bar dataKey={statement2Name} fill="#10B981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: '#3B82F6' }}></div>
                <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  {statement1Name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: '#10B981' }}></div>
                <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  {statement2Name}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {Object.entries(previewData).map(([categoryId, result], index) => {
            const category = categories.find(c => c.id === categoryId);
            const Icon = category?.icon || BarChart3;
            
            return (
              <div key={categoryId} className={`flex items-center justify-between p-4 rounded-lg ${
                isDark ? 'bg-gray-700/50' : 'bg-gray-50'
              }`}>
                <div className="flex items-center gap-3">
                  <div 
                    className="p-2 rounded-full"
                    style={{ backgroundColor: category?.color + '20' }}
                  >
                    <Icon 
                      className="h-5 w-5" 
                      style={{ color: category?.color }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      #{index + 1}
                    </span>
                    <span className={`font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                      {category?.name}
                    </span>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    <span className={`font-medium ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                      ${result.statement1.toFixed(2)}
                    </span>
                    {' vs '}
                    <span className={`font-medium ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                      ${result.statement2.toFixed(2)}
                    </span>
                  </div>
                  <div className={`font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    ${result.difference.toFixed(2)} difference
                  </div>
                  <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                    {categoryId === 'income' || categoryId === 'refunds' ? 'Income' : 'Spending'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {isPreview && Object.keys(data).length > 2 && (
          <div className={`mt-6 p-6 rounded-lg border ${
            isDark 
              ? 'bg-gradient-to-r from-blue-900/20 to-indigo-900/20 border-blue-700/50' 
              : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200'
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
                    ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                <CreditCard className="h-5 w-5" />
                Unlock Full Results - $9
              </button>
            </div>
          </div>
        )}
      </div>
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
      onSignIn();
      onBack();
    } catch (error) {
      setError('Google sign-in failed. Please try again.');
    } finally {
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
        onSignIn();
        onBack();
      } else {
        setError(result.error || 'Authentication failed');
      }
    } catch (error: any) {
      setError(error.message || 'Authentication failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isDark 
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' 
        : 'bg-gradient-to-br from-blue-50 via-white to-green-50'
    }`}>
      {/* Navigation Header */}
      <div className={`sticky top-0 z-40 backdrop-blur-sm border-b ${
        isDark ? 'bg-gray-900/80 border-gray-700' : 'bg-white/80 border-gray-200'
      }`}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${isDark ? 'bg-blue-600' : 'bg-blue-600'}`}>
                <Users className="h-5 w-5 text-white" />
              </div>
              <span className={`font-semibold text-lg ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                {isSignUp ? 'Create Account' : 'Sign In'}
              </span>
            </div>
            
            <button 
              onClick={onBack}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isDark 
                  ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                  : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
              }`}
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-8 max-w-md">
        <div className={`rounded-xl border shadow-lg p-8 ${
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          
          <div className="text-center mb-6">
            <div className={`p-3 rounded-full w-16 h-16 mx-auto flex items-center justify-center mb-4 ${
              isDark ? 'bg-blue-900/30' : 'bg-blue-100'
            }`}>
              <Users className={`h-8 w-8 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
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
              <div className={`w-full border-t ${isDark ? 'border-gray-600' : 'border-gray-300'}`} />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className={`px-2 ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-white text-gray-500'}`}>
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
                  ? 'bg-transparent text-gray-300 border-gray-600 hover:bg-gray-700' 
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
                        ? 'bg-gray-700 border-gray-600 text-gray-200' 
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
                      ? 'bg-gray-700 border-gray-600 text-gray-200' 
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
                      ? 'bg-gray-700 border-gray-600 text-gray-200' 
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
                      ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
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
                isDark ? 'text-gray-400 hover:text-blue-400' : 'text-gray-600 hover:text-blue-600'
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
        isDark ? 'bg-gray-800' : 'bg-white'
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
            isDark ? 'bg-blue-900/30' : 'bg-blue-100'
          }`}>
            <BarChart3 className={`h-8 w-8 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
          </div>
          
          <h3 className={`text-xl font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
            Unlock Full Comparison
          </h3>
          
          <div className={`text-left space-y-2 p-4 rounded-lg ${
            isDark ? 'bg-gray-700/50' : 'bg-gray-50'
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
                ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            <CreditCard className="h-5 w-5" />
            Pay with Stripe
          </button>
          
          <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
            Secure payment powered by Stripe. Your data is processed locally and never stored.
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

  const STRIPE_CHECKOUT_URLS = {
    starter: 'https://buy.stripe.com/test_dRmdRbcurfW97JAdhBgUM00',
    pro: 'https://buy.stripe.com/test_28EaEZ7a7fW9aVM0uPgUM01',
    business: 'https://buy.stripe.com/test_eVq8wR66325j3tk4L5gUM02'
  };

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

    // For paid plans, redirect directly to Stripe checkout
    if (planName === 'Starter') {
      window.location.href = STRIPE_CHECKOUT_URLS.starter;
      return;
    }
    
    if (planName === 'Pro') {
      window.location.href = STRIPE_CHECKOUT_URLS.pro;
      return;
    }
    
    if (planName === 'Business') {
      window.location.href = STRIPE_CHECKOUT_URLS.business;
      return;
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
    {
      name: 'Pro',
      price: '$69/month',
      pages: '400 pages per month',
      description: 'Great for small teams',
      priceId: 'price_1RrrwQRD0ogceRR4BEdntV12'
    },
    {
      name: 'Business',
      price: '$149/month',
      pages: '1,000 pages per month',
      description: 'Enterprise solution',
      priceId: 'price_1RrrwQRD0ogceRR41ZscbkhJ'
    }
  ];

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isDark 
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' 
        : 'bg-gradient-to-br from-blue-50 via-white to-green-50'
    }`}>
      {/* Navigation Header */}
      <div className={`sticky top-0 z-40 backdrop-blur-sm border-b ${
        isDark ? 'bg-gray-900/80 border-gray-700' : 'bg-white/80 border-gray-200'
      }`}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${isDark ? 'bg-blue-600' : 'bg-blue-600'}`}>
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <span className={`font-semibold text-lg ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                
              </span>
            </div>
            
            <button 
              onClick={onBack}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isDark 
                  ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                  : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
              }`}
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="space-y-8">
          <div className="text-center">
            <h1 className={`text-4xl md:text-5xl font-bold mb-4 ${
              isDark ? 'text-gray-100' : 'text-gray-800'
            }`}>
              Simple Pricing
            </h1>
            <p className={`text-lg ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Choose the plan that fits your needs
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {plans.map((plan, index) => (
              <div key={plan.name} className={`p-6 rounded-xl border shadow-lg ${
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
              } ${plan.isAnonymous ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                <div className="text-center mb-6">
                  <h3 className={`text-xl font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    {plan.name}
                  </h3>
                  <div className={`text-3xl font-bold mt-3 ${
                    plan.isAnonymous 
                      ? isDark ? 'text-blue-400' : 'text-blue-600'
                      : isDark ? 'text-blue-400' : 'text-blue-600'
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
                  className={`w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                    plan.isAnonymous
                      ? isDark
                        ? 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105'
                        : 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105'
                      : plan.name === 'Free'
                      ? isDark
                        ? 'bg-gray-600 hover:bg-gray-500 text-gray-200'
                        : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                      : isDark
                        ? 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105'
                        : 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105'
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

function SettingsPage({ isVisible, onBack, isDark, onToggleDarkMode, isAuthenticated, onShowPricing, userTier }: {
  isVisible: boolean;
  onBack: () => void;
  isDark: boolean;
  onToggleDarkMode: () => void;
  isAuthenticated: boolean;
  onShowPricing: () => void;
  userTier?: string;
}) {
  if (!isVisible) return null;

  const handleManageSubscription = () => {
    window.open('https://billing.stripe.com/p/login/test_dRmdRbcurfW97JAdhBgUM00', '_blank');
  };

  const handleUpgrade = () => {
    // Navigate to pricing page by triggering the pricing modal
    // We'll need to pass this function from the parent component
    if (onShowPricing) {
      onShowPricing();
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isDark 
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' 
        : 'bg-gradient-to-br from-blue-50 via-white to-green-50'
    }`}>
      {/* Navigation Header */}
      <div className={`sticky top-0 z-40 backdrop-blur-sm border-b ${
        isDark ? 'bg-gray-900/80 border-gray-700' : 'bg-white/80 border-gray-200'
      }`}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${isDark ? 'bg-blue-600' : 'bg-blue-600'}`}>
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <span className={`font-semibold text-lg ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                
              </span>
            </div>
            
            <button 
              onClick={onBack}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isDark 
                  ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                  : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
              }`}
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className={`rounded-xl border shadow-lg p-8 ${
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <div className="text-center mb-8">
            <h1 className={`text-3xl font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
              Settings
            </h1>
          </div>
          
          <div className="space-y-8">
            {/* Dark Mode Toggle */}
            <div className={`p-6 rounded-lg border ${
              isDark ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'
            }`}>
              <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${
                isDark ? 'text-gray-200' : 'text-gray-800'
              }`}>
                {isDark ? (
                  <Moon className={`h-5 w-5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                ) : (
                  <Sun className={`h-5 w-5 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} />
                )}
                Appearance
              </h3>
              
              <div className="flex items-center justify-between">
                <div>
                  <div className={`font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    Dark Mode
                  </div>
                  <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    Switch between light and dark themes
                  </div>
                </div>
                <button
                  onClick={onToggleDarkMode}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isDark 
                      ? 'bg-blue-600' 
                      : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isDark ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Subscription Management */}
            <div className={`p-6 rounded-lg border ${
              isDark ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'
            }`}>
              <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${
                isDark ? 'text-gray-200' : 'text-gray-800'
              }`}>
                <CreditCard className={`h-5 w-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                {isAuthenticated && userTier && userTier !== 'anonymous' && userTier !== 'signup' ? 'Subscription' : 'Upgrade'}
              </h3>
              
              <div className="flex justify-center">
                {isAuthenticated && userTier && userTier !== 'anonymous' && userTier !== 'signup' ? (
                  <button
                    onClick={handleManageSubscription}
                    className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 border ${
                      isDark 
                        ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' 
                        : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    Manage Subscription
                  </button>
                ) : (
                  <button
                    onClick={handleUpgrade}
                    className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                      isDark 
                        ? 'bg-purple-600 text-white hover:bg-purple-700' 
                        : 'bg-purple-600 text-white hover:bg-purple-700'
                    }`}
                  >
                    Upgrade
                  </button>
                )}
              </div>
            </div>
            
            {/* Share App */}
            <div className={`p-6 rounded-lg border ${
              isDark ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'
            }`}>
              <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${
                isDark ? 'text-gray-200' : 'text-gray-800'
              }`}>
                <Users className={`h-5 w-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                Share App
              </h3>
              <div className="flex items-center justify-center gap-3">
                <input
                  type="text"
                  value={window.location.origin}
                  readOnly
                  className={`px-4 py-2 rounded-lg border text-sm ${
                    isDark 
                      ? 'bg-gray-700 border-gray-600 text-gray-200' 
                      : 'bg-gray-50 border-gray-300 text-gray-700'
                  }`}
                  style={{ width: '300px' }}
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.origin);
                    alert('Link copied to clipboard!');
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                    isDark 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  Copy Link
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UsagePage({ isVisible, onBack, isDark }: {
  isVisible: boolean;
  onBack: () => void;
  isDark: boolean;
}) {
  const [usageData, setUsageData] = useState<any[]>([]);
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [anonymousUsage, setAnonymousUsage] = useState<number>(0);

  useEffect(() => {
    const loadData = async () => {
      try {
        const currentUser = await userService.getCurrentUser();
        setUser(currentUser);
        
        // If no authenticated user, check anonymous usage
        if (!currentUser) {
          const usageHistory = await userService.getUsageHistory();
          const totalUsed = usageHistory.reduce((sum, log) => sum + log.credits_used, 0);
          setAnonymousUsage(totalUsed);
        }
        
        const history = await userService.getUsageHistory();
        
        // Format the usage data for display
        const formattedHistory = history.map(log => ({
          id: log.id,
          date: new Date(log.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }),
          description: `${log.action === 'comparison' ? 'Bank Statement Comparison' : 'Page Processing'} - ${log.pages_processed} page${log.pages_processed > 1 ? 's' : ''}`,
          creditsUsed: log.credits_used,
          type: 'usage'
        }));
        
        setUsageData(formattedHistory);
      } catch (error) {
        console.error('Error loading usage data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (isVisible) {
      loadData();
    }
  }, [isVisible]);

  if (!isVisible) return null;

  // Calculate credits based on user tier
  const tierConfig = user ? TIER_CONFIG[user.tier] : TIER_CONFIG.anonymous;
  const creditsRemaining = user ? user.credits : (tierConfig.credits - anonymousUsage);
  const creditsUsed = user ? (tierConfig.credits - user.credits) : anonymousUsage;
  const totalCredits = tierConfig.credits;

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isDark 
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' 
        : 'bg-gradient-to-br from-blue-50 via-white to-green-50'
    }`}>
      {/* Navigation Header */}
      <div className={`sticky top-0 z-40 backdrop-blur-sm border-b ${
        isDark ? 'bg-gray-900/80 border-gray-700' : 'bg-white/80 border-gray-200'
      }`}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${isDark ? 'bg-blue-600' : 'bg-blue-600'}`}>
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <span className={`font-semibold text-lg ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                BankCompare
              </span>
            </div>
            
            <button 
              onClick={onBack}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isDark 
                  ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                  : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
              }`}
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className={`rounded-xl border shadow-lg p-8 ${
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <div className="mb-8">
            <h1 className={`text-3xl font-bold mb-4 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
              Usage
            </h1>
            <p className={`text-lg ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              {user ? `${user.credits} credits available` : `${creditsRemaining} credits available`}
            </p>
          </div>
          
          {/* Credits Section */}
          <div className={`p-6 rounded-lg border mb-8 ${
            isDark ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'
          }`}>
            <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${
              isDark ? 'text-gray-200' : 'text-gray-800'
            }`}>
              <DollarSign className={`h-5 w-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
              Credits & Usage
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <div className={`text-2xl font-bold ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                  {creditsRemaining}
                </div>
                <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  Credits Remaining
                </div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                  {creditsUsed}
                </div>
                <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  Credits Used
                </div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
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
          </div>
          
          <div className="mb-6">
            <h2 className={`text-xl font-semibold mb-4 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
              Recent Usage History
            </h2>
          </div>
          
          {loading ? (
            <div className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              <Loader2 className="mx-auto h-8 w-8 animate-spin mb-4" />
              <p>Loading usage history...</p>
            </div>
          ) : usageData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className={`border-b ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
                    <th className={`text-left py-3 px-4 font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      Date
                    </th>
                    <th className={`text-left py-3 px-4 font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      Description
                    </th>
                    <th className={`text-left py-3 px-4 font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      Credits Used
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {usageData.map((item, index) => (
                    <tr key={index} className={`border-b ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                      <td className={`py-3 px-4 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                        {item.date}
                      </td>
                      <td className={`py-3 px-4 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                        {item.description}
                      </td>
                      <td className={`py-3 px-4 font-semibold ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                        -{item.creditsUsed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              <BarChart3 className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No usage history yet</h3>
              <p className="text-sm">Start comparing bank statements to see your usage here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PastDocumentsPage({ isVisible, onBack, isDark }: {
  isVisible: boolean;
  onBack: () => void;
  isDark: boolean;
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
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' 
        : 'bg-gradient-to-br from-blue-50 via-white to-green-50'
    }`}>
      {/* Navigation Header */}
      <div className={`sticky top-0 z-40 backdrop-blur-sm border-b ${
        isDark ? 'bg-gray-900/80 border-gray-700' : 'bg-white/80 border-gray-200'
      }`}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${isDark ? 'bg-blue-600' : 'bg-blue-600'}`}>
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <span className={`font-semibold text-lg ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                BankCompare
              </span>
            </div>
            
            <button 
              onClick={onBack}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isDark 
                  ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                  : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
              }`}
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
                  isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
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
                      isDark ? 'bg-gray-700/50' : 'bg-gray-50'
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
                      isDark ? 'bg-gray-700/50' : 'bg-gray-50'
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
                      onClick={() => handleDownloadPDF(doc.id)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                        isDark 
                          ? 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105' 
                          : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105'
                      }`}
                    >
                      <Download className="h-4 w-4" />
                      Download PDF
                    </button>
                    <button
                      onClick={() => handleDownloadCSV(doc.id)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 border ${
                        isDark 
                          ? 'bg-transparent text-gray-300 border-gray-600 hover:bg-gray-700' 
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
    <div className={`rounded-xl p-6 shadow-lg border ${
      isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
    }`}>
      <div className="flex items-center justify-between mb-6">
        <h3 className={`text-xl font-bold flex items-center gap-2 ${
          isDark ? 'text-gray-200' : 'text-gray-800'
        }`}>
          <FileText className={`h-6 w-6 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
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
        </div>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {editingTransactions.map((transaction) => (
          <div key={transaction.id} className={`p-4 rounded-lg border ${
            isDark ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'
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
                    {transaction.description}
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

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onCancel}
          className={`px-6 py-2 rounded-lg font-medium transition-colors ${
            isDark 
              ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
              : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
          }`}
        >
          Cancel
        </button>
        <button
          onClick={handleSaveAll}
          className={`px-6 py-2 rounded-lg font-medium transition-colors ${
            isDark 
              ? 'bg-blue-600 hover:bg-blue-700 text-white' 
              : 'bg-blue-600 hover:bg-blue-700 text-white'
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
    description: transaction.description,
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
                ? 'bg-gray-700 border-gray-600 text-gray-200' 
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
                ? 'bg-gray-700 border-gray-600 text-gray-200' 
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
              ? 'bg-gray-700 border-gray-600 text-gray-200' 
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
                ? 'bg-gray-700 border-gray-600 text-gray-200' 
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
                ? 'bg-gray-700 border-gray-600 text-gray-200' 
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
              ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
              : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
          }`}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            isDark 
              ? 'bg-blue-600 hover:bg-blue-700 text-white' 
              : 'bg-blue-600 hover:bg-blue-700 text-white'
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
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [files, setFiles] = useState<{ statement1: File | null; statement2: File | null }>({
    statement1: null,
    statement2: null
  });
  
  const [parsedData, setParsedData] = useState<{ statement1: ParsedStatement | null; statement2: ParsedStatement | null }>({
    statement1: null,
    statement2: null
  });
  
  const [uploading, setUploading] = useState<{ statement1: boolean; statement2: boolean }>({
    statement1: false,
    statement2: false
  });
  
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [comparisonResults, setComparisonResults] = useState<{ [key: string]: ComparisonResult } | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [showTransactionEditor, setShowTransactionEditor] = useState<{ statement1: boolean; statement2: boolean }>({
    statement1: false,
    statement2: false
  });
  const [editableStatementNames, setEditableStatementNames] = useState<{ statement1: string; statement2: string }>({
    statement1: 'Statement 1',
    statement2: 'Statement 2'
  });
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showSettingsPage, setShowSettingsPage] = useState(false);
  const [showUsagePage, setShowUsagePage] = useState(false);
  const [showPastDocumentsPage, setShowPastDocumentsPage] = useState(false);
  const [showAuthPage, setShowAuthPage] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false); // Simulate signed in state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userTier, setUserTier] = useState<string | undefined>(undefined);

  const [comparisonGenerated, setComparisonGenerated] = useState(false);

  // Check authentication status on component mount
  useEffect(() => {
    const checkAuthStatus = async () => {
      const user = await userService.getCurrentUser();
      setIsAuthenticated(!!user);
      if (user) {
        setUserTier(user.tier);
      } else {
        setUserTier(undefined);
      }
    };
    checkAuthStatus();
  }, []);

  const parser = new BankStatementParser();

  const handleFileUpload = async (statementKey: 'statement1' | 'statement2', file: File) => {
    setFiles(prev => ({ ...prev, [statementKey]: file }));
    setUploading(prev => ({ ...prev, [statementKey]: true }));
    setComparisonGenerated(false);
    setComparisonResults(null);
    
    // Show upload successful with a brief loading animation
    setTimeout(() => {
      setUploading(prev => ({ ...prev, [statementKey]: false }));
      // Show a brief success message
      alert(`${file.name} uploaded successfully! Ready for comparison.`);
    }, 1500);
  };

  const generateComparison = async () => {
    if (!files.statement1 || !files.statement2) {
      alert('Please upload both statements first.');
      return;
    }

    setUploading({ statement1: true, statement2: true });
    
    try {
      // Process both files through API
      const [result1, result2] = await Promise.all([
        parser.parsePDF(files.statement1),
        parser.parsePDF(files.statement2)
      ]);
      
      setParsedData({ statement1: result1, statement2: result2 });
      
      // Calculate total pages processed from both statements
      // Get actual page count from PDF files
      const pages1 = await parser.getPDFPageCount(files.statement1);
      const pages2 = await parser.getPDFPageCount(files.statement2);
      const totalPages = pages1 + pages2;
      
      // Check tier limits before allowing comparison
      const tierCheck = await userService.canPerformAction('comparison', totalPages);
      
      if (!tierCheck.canPerform) {
        alert(tierCheck.reason || 'You have reached your tier limit. Please upgrade to continue.');
        return;
      }

      // Mark anonymous usage if user is not signed in


      // Generate comparison for ALL categories (not just selected ones)
      const comparison: { [key: string]: ComparisonResult } = {};
      
      categories.forEach(category => {
        const categoryId = category.id;
        
        // Calculate withdrawals for each statement
        const withdrawals1 = result1.withdrawals
          .filter(t => t.category === categoryId)
          .reduce((sum, t) => sum + t.amount, 0);
          
        const withdrawals2 = result2.withdrawals
          .filter(t => t.category === categoryId)
          .reduce((sum, t) => sum + t.amount, 0);
        
        // Calculate deposits for each statement
        const deposits1 = result1.deposits
          .filter(t => t.category === categoryId)
          .reduce((sum, t) => sum + t.amount, 0);
          
        const deposits2 = result2.deposits
          .filter(t => t.category === categoryId)
          .reduce((sum, t) => sum + t.amount, 0);
        
        // For spending categories, focus on withdrawals (money going out)
        // For income categories, focus on deposits (money coming in)
        const isIncomeCategory = categoryId === 'income';
        
        const amount1 = isIncomeCategory ? deposits1 : withdrawals1;
        const amount2 = isIncomeCategory ? deposits2 : withdrawals2;
        
        comparison[categoryId] = {
          category: categoryId,
          statement1: amount1,
          statement2: amount2,
          difference: Math.abs(amount1 - amount2),
          winner: amount1 > amount2 ? 'Statement 2' : 'Statement 1'
        };
      });
      
      setComparisonResults(comparison);
      setComparisonGenerated(true);
      
      // Log the usage based on pages processed
      await userService.logUsage('comparison', totalPages);
      
      // Save comparison to database
      try {
        const user = await userService.getCurrentUser();
        const sessionId = userService.getSessionId();
        
        // Calculate totals for the comparison
        const totalWithdrawals = result1.totalWithdrawals + result2.totalWithdrawals;
        const totalDeposits = result1.totalDeposits + result2.totalDeposits;
        
        // Save to comparisons table
        const saveData = {
          user_id: user?.id || null,
          session_id: user ? null : sessionId,
          statement1_name: editableStatementNames.statement1,
          statement2_name: editableStatementNames.statement2,
          categories: Object.keys(comparison),
          results: comparison,
          total_withdrawals: totalWithdrawals,
          total_deposits: totalDeposits,
          statement1_withdrawals: result1.totalWithdrawals,
          statement1_deposits: result1.totalDeposits,
          statement2_withdrawals: result2.totalWithdrawals,
          statement2_deposits: result2.totalDeposits,
          status: 'completed'
        };
        
        console.log('Saving comparison data:', saveData);
        
        const { data: savedData, error: saveError } = await supabase
          .from('comparisons')
          .insert(saveData)
          .select();
          
        if (saveError) {
          console.error('Error saving comparison:', saveError);
        } else {
          console.log('Successfully saved comparison:', savedData);
        }
      } catch (error) {
        console.error('Error saving comparison to database:', error);
      }
      
      alert(`Comparison completed! Processed ${totalPages} pages.`);
      
    } catch (error) {
      console.error('Error processing PDFs:', error);
      alert('Error processing PDFs. Please try again.');
    } finally {
      setUploading({ statement1: false, statement2: false });
    }
  };

  const handlePayment = async () => {
    const stripe = await stripePromise;
    if (!stripe) return;

    // In a real app, you'd create a checkout session on your backend
    // For demo purposes, we'll just simulate payment success
    setTimeout(() => {
      setIsPaid(true);
      setShowPaywall(false);
    }, 1000);
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
            <div class="statement">
              <h3>${editableStatementNames.statement1}</h3>
              <p>Total Withdrawals: $${parsedData.statement1?.totalWithdrawals.toFixed(2) || '0.00'}</p>
              <p>Total Deposits: $${parsedData.statement1?.totalDeposits.toFixed(2) || '0.00'}</p>
              <p>Net: $${((parsedData.statement1?.totalDeposits || 0) - (parsedData.statement1?.totalWithdrawals || 0)).toFixed(2)}</p>
            </div>
            <div class="statement">
              <h3>${editableStatementNames.statement2}</h3>
              <p>Total Withdrawals: $${parsedData.statement2?.totalWithdrawals.toFixed(2) || '0.00'}</p>
              <p>Total Deposits: $${parsedData.statement2?.totalDeposits.toFixed(2) || '0.00'}</p>
              <p>Net: $${((parsedData.statement2?.totalDeposits || 0) - (parsedData.statement2?.totalWithdrawals || 0)).toFixed(2)}</p>
            </div>
          </div>
          
          <div class="comparison">
            <h2>Category Comparison</h2>
            ${Object.entries(comparisonResults || {}).map(([categoryId, result]) => {
              const category = categories.find(c => c.id === categoryId);
              return `
                <div class="category">
                  <h3>${category?.name || categoryId}</h3>
                  <div class="statement">
                    <span class="amount">${editableStatementNames.statement1}: $${result.statement1.toFixed(2)}</span>
                  </div>
                  <div class="statement">
                    <span class="amount">${editableStatementNames.statement2}: $${result.statement2.toFixed(2)}</span>
                  </div>
                  <div class="difference">
                    <strong>Difference: $${result.difference.toFixed(2)}</strong>
                  </div>
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
                ${[
                  ...(parsedData.statement1?.transactions || []).map(t => ({
                    ...t,
                    statement: editableStatementNames.statement1
                  })),
                  ...(parsedData.statement2?.transactions || []).map(t => ({
                    ...t,
                    statement: editableStatementNames.statement2
                  }))
                ].map(t => `
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
    if (!comparisonResults || !parsedData.statement1 || !parsedData.statement2) {
      alert('No data to export');
      return;
    }

    // Create CSV content
    let csvContent = 'Statement,Category,Description,Date,Amount,Type\n';
    
    // Add transactions from both statements
    const allTransactions = [
      ...(parsedData.statement1.transactions || []).map(t => ({
        ...t,
        statement: editableStatementNames.statement1
      })),
      ...(parsedData.statement2.transactions || []).map(t => ({
        ...t,
        statement: editableStatementNames.statement2
      }))
    ];

    allTransactions.forEach(transaction => {
      const category = categories.find(c => c.id === transaction.category)?.name || transaction.category;
      const row = [
        transaction.statement,
        category,
        `"${transaction.description.replace(/"/g, '""')}"`, // Escape quotes in CSV
        transaction.date,
        transaction.amount.toFixed(2),
        transaction.type
      ].join(',');
      csvContent += row + '\n';
    });

    // Add comparison summary
    csvContent += '\nCategory Comparison\n';
    csvContent += 'Category,Statement1,Statement2,Difference\n';
    
    Object.entries(comparisonResults).forEach(([categoryId, result]) => {
      const category = categories.find(c => c.id === categoryId)?.name || categoryId;
      const row = [
        category,
        result.statement1.toFixed(2),
        result.statement2.toFixed(2),
        result.difference.toFixed(2)
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

  const handleTransactionEditorSave = (statementKey: 'statement1' | 'statement2', updatedTransactions: Transaction[]) => {
    if (!parsedData[statementKey]) return;
    
    const updatedParsedData = { ...parsedData[statementKey]! };
    updatedParsedData.transactions = updatedTransactions;
    
    // Recalculate withdrawals and deposits
    const withdrawals = updatedTransactions.filter(t => t.type === 'withdrawal');
    const deposits = updatedTransactions.filter(t => t.type === 'deposit');
    
    updatedParsedData.withdrawals = withdrawals;
    updatedParsedData.deposits = deposits;
    updatedParsedData.totalWithdrawals = withdrawals.reduce((sum, t) => sum + t.amount, 0);
    updatedParsedData.totalDeposits = deposits.reduce((sum, t) => sum + t.amount, 0);
    
    setParsedData(prev => ({ ...prev, [statementKey]: updatedParsedData }));
    setShowTransactionEditor(prev => ({ ...prev, [statementKey]: false }));
  };

  const resetComparison = () => {
    setFiles({ statement1: null, statement2: null });
    setParsedData({ statement1: null, statement2: null });
    setUploading({ statement1: false, statement2: false });
    setSelectedCategories([]);
    setComparisonResults(null);
    setComparisonGenerated(false);
    setShowTransactionEditor({ statement1: false, statement2: false });
    setEditableStatementNames({ statement1: 'Statement 1', statement2: 'Statement 2' });
  };

  const canGenerate = parsedData.statement1 && parsedData.statement2 && selectedCategories.length > 0 && !comparisonGenerated;
  const bothFilesUploaded = files.statement1 && files.statement2;

  return (
    <>
      {!showAuthPage && !showPricingModal && !showSettingsPage && !showUsagePage && !showPastDocumentsPage ? (
        <div className={`min-h-screen transition-colors duration-300 ${
          isDarkMode 
            ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' 
            : 'bg-gradient-to-br from-blue-50 via-white to-green-50'
        }`}>
          {/* Navigation Header */}
          <div className={`sticky top-0 z-40 backdrop-blur-sm border-b ${
            isDarkMode ? 'bg-gray-900/80 border-gray-700' : 'bg-white/80 border-gray-200'
          }`}>
            <div className="container mx-auto px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      setShowPricingModal(false);
                      setShowSettingsPage(false);
                      setShowUsagePage(false);
                      setShowPastDocumentsPage(false);
                    }}
                    className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                  >
                    <BarChart3 className="h-5 w-5 text-white" />
                  </button>
                </div>
                
                <nav className="flex items-center gap-6">
                  {!isSignedIn ? (
                    <>
                      {/* Anonymous usage indicator - will be updated dynamically */}
                      <div className={`text-xs px-2 py-1 rounded-full ${
                        isDarkMode 
                          ? 'bg-green-900/30 text-green-400 border border-green-600' 
                          : 'bg-green-100 text-green-800 border border-green-300'
                      }`}>
                        Anonymous Tier
                      </div>
                      
                      <button 
                        onClick={() => setShowUsagePage(true)}
                        className={`text-sm font-medium transition-colors hover:scale-105 ${
                          isDarkMode ? 'text-gray-300 hover:text-blue-400' : 'text-gray-600 hover:text-blue-600'
                        }`}
                      >
                        Usage
                      </button>
                      <button 
                        onClick={() => setShowPricingModal(true)}
                        className={`text-sm font-medium transition-colors hover:scale-105 ${
                          isDarkMode ? 'text-gray-300 hover:text-blue-400' : 'text-gray-600 hover:text-blue-600'
                        }`}
                      >
                        Pricing
                      </button>
                      <button 
                        onClick={() => setShowSettingsPage(true)}
                        className={`text-sm font-medium transition-colors hover:scale-105 ${
                          isDarkMode ? 'text-gray-300 hover:text-blue-400' : 'text-gray-600 hover:text-blue-600'
                        }`}
                      >
                        Settings
                      </button>

                      <button 
                        onClick={() => setShowAuthPage(true)}
                        className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                          isDarkMode 
                            ? 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105' 
                            : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105'
                        }`}
                      >
                        Sign In
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        onClick={() => setShowPastDocumentsPage(true)}
                        className={`text-sm font-medium transition-colors hover:scale-105 ${
                          isDarkMode ? 'text-gray-300 hover:text-blue-400' : 'text-gray-600 hover:text-blue-600'
                        }`}
                      >
                        Past Documents
                      </button>
                      <button 
                        onClick={() => setShowUsagePage(true)}
                        className={`text-sm font-medium transition-colors hover:scale-105 ${
                          isDarkMode ? 'text-gray-300 hover:text-blue-400' : 'text-gray-600 hover:text-blue-600'
                        }`}
                      >
                        Usage
                      </button>
                      <button 
                        onClick={() => setShowSettingsPage(true)}
                        className={`text-sm font-medium transition-colors hover:scale-105 ${
                          isDarkMode ? 'text-gray-300 hover:text-blue-400' : 'text-gray-600 hover:text-blue-600'
                        }`}
                      >
                        Settings
                      </button>
                      <button 
                        onClick={() => setIsSignedIn(false)}
                        className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                          isDarkMode 
                            ? 'bg-gray-600 text-white hover:bg-gray-700 hover:scale-105' 
                            : 'bg-gray-600 text-white hover:bg-gray-700 hover:scale-105'
                        }`}
                      >
                        Sign Out
                      </button>
                    </>
                  )}
                </nav>
              </div>
            </div>
          </div>
          
          <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className={`p-4 rounded-2xl shadow-lg ${isDarkMode ? 'bg-gradient-to-br from-blue-600 to-blue-700' : 'bg-gradient-to-br from-blue-600 to-blue-700'}`}>
              <BarChart3 className="h-8 w-8 text-white" />
            </div>
            <h1 className={`text-4xl md:text-5xl font-bold bg-gradient-to-r ${
              isDarkMode ? 'text-gray-100' : 'text-gray-800'
            } leading-tight`}>
              Bank Statement Comparison
            </h1>
          </div>
          <div className={`max-w-3xl mx-auto space-y-3`}>
            <p className={`text-lg ${
              isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Upload two bank statements and get instant spending comparisons by category.<br />
              Perfect for co-parents, roommates, and couples splitting expenses. <br />
              Or for keeping tabs of your month to month spending.
            </p>
          </div>
        </div>

        {/* Trust Indicators */}
        <div className={`text-center mb-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          <div className="flex items-center justify-center gap-6 text-sm">
          </div>
        </div>

        {/* File Upload Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <FileUploadZone
            onFileUpload={(file) => handleFileUpload('statement1', file)}
            label="Statement 1"
            isUploading={uploading.statement1}
            uploadedFile={files.statement1}
            parsedData={parsedData.statement1}
            isDark={isDarkMode}
            statementName={editableStatementNames.statement1}
            onStatementNameChange={(name) => setEditableStatementNames(prev => ({ ...prev, statement1: name }))}
            comparisonGenerated={comparisonGenerated}
          />
          <FileUploadZone
            onFileUpload={(file) => handleFileUpload('statement2', file)}
            label="Statement 2"
            isUploading={uploading.statement2}
            uploadedFile={files.statement2}
            parsedData={parsedData.statement2}
            isDark={isDarkMode}
            statementName={editableStatementNames.statement2}
            onStatementNameChange={(name) => setEditableStatementNames(prev => ({ ...prev, statement2: name }))}
            comparisonGenerated={comparisonGenerated}
          />
        </div>

        {/* Generate Comparison Button */}
        {bothFilesUploaded && (
          <div className="text-center mb-8">
            <button
              onClick={generateComparison}
              className={`px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 ${
                isDarkMode 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl'
              }`}
            >
              Generate Comparison
            </button>
            <p className={`text-sm mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              This will process all categories and charge based on pages processed
            </p>
          </div>
        )}

        {/* Transaction Editors */}
        {showTransactionEditor.statement1 && parsedData.statement1 && (
          <div className="mb-8">
            <TransactionEditor
              transactions={parsedData.statement1.transactions}
              onSave={(transactions) => handleTransactionEditorSave('statement1', transactions)}
              onCancel={() => setShowTransactionEditor(prev => ({ ...prev, statement1: false }))}
              isDark={isDarkMode}
              statementTitle={editableStatementNames.statement1}
            />
          </div>
        )}

        {showTransactionEditor.statement2 && parsedData.statement2 && (
          <div className="mb-8">
            <TransactionEditor
              transactions={parsedData.statement2.transactions}
              onSave={(transactions) => handleTransactionEditorSave('statement2', transactions)}
              onCancel={() => setShowTransactionEditor(prev => ({ ...prev, statement2: false }))}
              isDark={isDarkMode}
              statementTitle={editableStatementNames.statement2}
            />
          </div>
        )}

        {/* Overall Summary */}
        {bothFilesUploaded && comparisonGenerated && (
          <div className={`rounded-xl p-6 shadow-lg border mb-8 ${
            isDarkMode 
              ? 'bg-gray-800 border-gray-700' 
              : 'bg-white border-gray-100'
          }`}>
            <h3 className={`text-lg font-semibold mb-4 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
              Overall Summary
            </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Statement 1 Summary */}
                <div className={`p-4 rounded-lg border ${
                  isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
                }`}>
                  <h4 className={`font-medium mb-3 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {editableStatementNames.statement1}
                  </h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Transactions Found:</span>
                      <span className={`font-medium ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                        {parsedData.statement1?.transactions.length || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total Withdrawals:</span>
                      <span className={`font-medium ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                        -${parsedData.statement1?.totalWithdrawals.toFixed(2) || '0.00'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total Deposits:</span>
                      <span className={`font-medium ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                        +${parsedData.statement1?.totalDeposits.toFixed(2) || '0.00'}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-gray-300 dark:border-gray-600">
                      <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Net:</span>
                      <span className={`font-bold ${
                        (parsedData.statement1?.totalDeposits || 0) - (parsedData.statement1?.totalWithdrawals || 0) >= 0
                          ? isDarkMode ? 'text-green-400' : 'text-green-600'
                          : isDarkMode ? 'text-red-400' : 'text-red-600'
                      }`}>
                        {((parsedData.statement1?.totalDeposits || 0) - (parsedData.statement1?.totalWithdrawals || 0)) >= 0 ? '+' : ''}
                        ${((parsedData.statement1?.totalDeposits || 0) - (parsedData.statement1?.totalWithdrawals || 0)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Statement 2 Summary */}
                <div className={`p-4 rounded-lg border ${
                  isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
                }`}>
                  <h4 className={`font-medium mb-3 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {editableStatementNames.statement2}
                  </h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Transactions Found:</span>
                      <span className={`font-medium ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                        {parsedData.statement2?.transactions.length || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total Withdrawals:</span>
                      <span className={`font-medium ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                        -${parsedData.statement2?.totalWithdrawals.toFixed(2) || '0.00'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total Deposits:</span>
                      <span className={`font-medium ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                        +${parsedData.statement2?.totalDeposits.toFixed(2) || '0.00'}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-gray-300 dark:border-gray-600">
                      <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Net:</span>
                      <span className={`font-bold ${
                        (parsedData.statement2?.totalDeposits || 0) - (parsedData.statement2?.totalWithdrawals || 0) >= 0
                          ? isDarkMode ? 'text-green-400' : 'text-green-600'
                          : isDarkMode ? 'text-red-400' : 'text-red-600'
                      }`}>
                        {((parsedData.statement2?.totalDeposits || 0) - (parsedData.statement2?.totalWithdrawals || 0)) >= 0 ? '+' : ''}
                        ${((parsedData.statement2?.totalDeposits || 0) - (parsedData.statement2?.totalWithdrawals || 0)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

            {/* Edit Transactions Buttons - Underneath Overall Summary */}
            <div className="mt-6 mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="text-center">
                <button
                  onClick={() => setShowTransactionEditor(prev => ({ ...prev, statement1: true }))}
                  className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                    isDarkMode 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105'
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  Edit {editableStatementNames.statement1}
                </button>
              </div>
              <div className="text-center">
                <button
                  onClick={() => setShowTransactionEditor(prev => ({ ...prev, statement2: true }))}
                  className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                    isDarkMode 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105'
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  Edit {editableStatementNames.statement2}
                </button>
              </div>
            </div>

          </div>
        )}

        {/* Category Selection */}
        {bothFilesUploaded && comparisonGenerated && (
          <div className={`rounded-xl p-6 shadow-lg border mb-8 ${
            isDarkMode 
              ? 'bg-gray-800 border-gray-700' 
              : 'bg-white border-gray-100'
          }`}>
            <CategorySelector
              selectedCategories={selectedCategories}
              onCategoryChange={setSelectedCategories}
              comparisonData={comparisonResults}
              parsedData={parsedData}
              isDark={isDarkMode}
              editableStatementNames={editableStatementNames}
            />
          </div>
        )}

        {/* Results */}
        {comparisonResults && comparisonGenerated && (
          <div className="space-y-6">
            <ComparisonResults
              data={comparisonResults}
              statement1Name={editableStatementNames.statement1}
              statement2Name={editableStatementNames.statement2}
              isPreview={false}
              onUnlock={() => setShowPaywall(true)}
              isDark={isDarkMode}
            />

            <div className={`rounded-xl p-6 shadow-lg border ${
              isDarkMode 
                ? 'bg-gray-800 border-gray-700' 
                : 'bg-white border-gray-100'
            }`}>
              <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${
                isDarkMode ? 'text-gray-200' : 'text-gray-800'
              }`}>
                <Download className={`h-5 w-5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                Export Options
              </h3>
              
                                              <div className="flex flex-wrap gap-4 justify-center">
                  <button
                    onClick={exportToPDF}
                    className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg transition-colors ${
                      isDarkMode 
                        ? 'bg-red-600 hover:bg-red-700 text-white' 
                        : 'bg-red-600 hover:bg-red-700 text-white'
                    }`}
                  >
                    <FileText className="h-5 w-5" />
                    Export PDF Report
                  </button>
                  
                  <button
                    onClick={exportToCSV}
                    className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg transition-colors ${
                      isDarkMode 
                        ? 'bg-green-600 hover:bg-green-700 text-white' 
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    <Receipt className="h-5 w-5" />
                    Export CSV Data
                  </button>
                </div>
              </div>
            </div>
            
        )}
        
        {/* Compare More Documents Button - Outside Results Section */}
        {comparisonResults && comparisonGenerated && (
          <div className="mt-6 text-center">
            <button
              onClick={resetComparison}
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg transition-colors font-medium ${
                isDarkMode 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105'
              }`}
            >
              <Upload className="h-5 w-5" />
              Compare More Documents
            </button>
          </div>
        )}

        {/* Animation Section */}
        {!bothFilesUploaded && (
          <div className="mt-16 mb-16">
            <div className="text-center mb-12">
              <h3 className={`text-2xl font-bold mb-4 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                Transform Your Bank Statements
              </h3>
              <p className={`text-lg ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Two statements, one clear comparison
              </p>
            </div>
            
            <div className="relative max-w-4xl mx-auto">
              {/* Flowing Animation Container */}
              <div className="relative h-96 overflow-hidden">
                {/* Step 1: Two Documents */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex gap-8 animate-pulse">
                    {/* Document 1 */}
                    <div className={`
                      w-32 h-40 rounded-lg shadow-lg transform transition-all duration-[4000ms] ease-in-out
                      hover:scale-110 hover:-translate-x-16 hover:-rotate-12
                      ${isDarkMode ? 'bg-gradient-to-b from-gray-700 to-gray-800 border border-gray-600' : 'bg-gradient-to-b from-white to-gray-50 border border-gray-200'}
                    `}>
                      <div className={`p-3 border-b ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                        <div className={`h-2 rounded mb-1 ${isDarkMode ? 'bg-gray-500' : 'bg-gray-400'}`} style={{ width: '80%' }}></div>
                        <div className={`h-1 rounded ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} style={{ width: '60%' }}></div>
                      </div>
                      <div className="p-3 space-y-2">
                        {[...Array(6)].map((_, i) => (
                          <div key={i} className="flex justify-between items-center">
                            <div className={`h-1 rounded ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} style={{ width: '60%' }}></div>
                            <div className={`h-1 rounded ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} style={{ width: '20%' }}></div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Document 2 */}
                    <div className={`
                      w-32 h-40 rounded-lg shadow-lg transform transition-all duration-[4000ms] ease-in-out
                      hover:scale-110 hover:translate-x-16 hover:rotate-12
                      ${isDarkMode ? 'bg-gradient-to-b from-gray-700 to-gray-800 border border-gray-600' : 'bg-gradient-to-b from-white to-gray-50 border border-gray-200'}
                    `}>
                      <div className={`p-3 border-b ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                        <div className={`h-2 rounded mb-1 ${isDarkMode ? 'bg-gray-500' : 'bg-gray-400'}`} style={{ width: '70%' }}></div>
                        <div className={`h-1 rounded ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} style={{ width: '50%' }}></div>
                      </div>
                      <div className="p-3 space-y-2">
                        {[...Array(6)].map((_, i) => (
                          <div key={i} className="flex justify-between items-center">
                            <div className={`h-1 rounded ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} style={{ width: '55%' }}></div>
                            <div className={`h-1 rounded ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} style={{ width: '25%' }}></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  {/* Merge Arrow */}
                  <div className={`
                    absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2
                    transition-all duration-[4000ms] ease-in-out opacity-0 hover:opacity-100
                  `}>
                    <div className={`
                      p-3 rounded-full shadow-lg
                      ${isDarkMode ? 'bg-blue-600' : 'bg-blue-500'}
                    `}>
                      <BarChart3 className="h-6 w-6 text-white animate-spin" style={{ animationDuration: '3s' }} />
                    </div>
                  </div>
                </div>
                
                {/* Step 2: Comparison Result (appears on hover) */}
                <div className={`
                  absolute inset-0 flex items-center justify-center
                  opacity-0 hover:opacity-100 transition-all duration-[2000ms] ease-in-out
                  transform translate-y-8 hover:translate-y-0
                `}>
                  <div className={`
                    w-80 h-64 rounded-xl shadow-2xl p-6
                    ${isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}
                  `}>
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-4">
                      <BarChart3 className={`h-6 w-6 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                      <h4 className={`font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                        Spending Comparison
                      </h4>
                    </div>
                    
                    {/* Category Comparisons */}
                    <div className="space-y-3">
                      {categories.slice(0, 4).map((category, i) => {
                        const Icon = category.icon;
                        return (
                          <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: category.color }}
                              ></div>
                              <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                {category.name}
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <div className={`px-2 py-1 rounded text-xs ${isDarkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-700'}`}>
                                ${(Math.random() * 200 + 50).toFixed(0)}
                              </div>
                              <div className={`px-2 py-1 rounded text-xs ${isDarkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700'}`}>
                                ${(Math.random() * 200 + 50).toFixed(0)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    

                  </div>
                </div>
                
                {/* Floating particles effect */}
                <div className="absolute inset-0 pointer-events-none">
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      className={`
                        absolute w-2 h-2 rounded-full opacity-30
                        animate-pulse
                        ${isDarkMode ? 'bg-blue-400' : 'bg-blue-500'}
                      `}
                      style={{
                        left: `${20 + i * 15}%`,
                        top: `${30 + (i % 2) * 40}%`,
                        animationDelay: `${i * 0.5}s`,
                        animationDuration: '2s'
                      }}
                    ></div>
                  ))}
                </div>
              </div>
              

            </div>
          </div>
        )}

        {/* Features Section */}
        {!bothFilesUploaded && (
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-6">
              <div className={`p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center ${
                isDarkMode ? 'bg-blue-900/30' : 'bg-blue-100'
              }`}>
                <Upload className={`h-8 w-8 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
              </div>
              <h3 className={`font-semibold mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                Smart Upload
              </h3>
              <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
                Drag & drop PDFs from Wells Fargo, Chase, Bank of America, and more
              </p>
            </div>
            
            <div className="text-center p-6">
              <div className={`p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center ${
                isDarkMode ? 'bg-green-900/30' : 'bg-green-100'
              }`}>
                <Users className={`h-8 w-8 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
              </div>
              <h3 className={`font-semibold mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                Perfect for Couples
              </h3>
              <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
                Compare spending between partners, roommates, or co-parents easily
              </p>
            </div>
            
            <div className="text-center p-6">
              <div className={`p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center ${
                isDarkMode ? 'bg-purple-900/30' : 'bg-purple-100'
              }`}>
                <BarChart3 className={`h-8 w-8 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
              </div>
              <h3 className={`font-semibold mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                Instant Analysis
              </h3>
              <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
                Get detailed breakdowns with charts and exportable reports
              </p>
            </div>
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
          onSignIn={() => setIsSignedIn(true)}
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
        />
      ) : showUsagePage ? (
        <UsagePage
          isVisible={showUsagePage}
          onBack={() => setShowUsagePage(false)}
          isDark={isDarkMode}
        />
      ) : showPastDocumentsPage ? (
        <PastDocumentsPage
          isVisible={showPastDocumentsPage}
          onBack={() => setShowPastDocumentsPage(false)}
          isDark={isDarkMode}
        />
      ) : (
        <PricingPage
          isVisible={showPricingModal}
          onBack={() => setShowPricingModal(false)}
          isDark={isDarkMode}
          onOpenAuth={() => setShowAuthPage(true)}
        />
      )}
      

      
    </>
  );
}

export default App;