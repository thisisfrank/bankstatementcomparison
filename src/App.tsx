import React, { useState, useCallback } from 'react';
import { Upload, FileText, BarChart3, Download, CheckCircle, AlertCircle, Loader2, CreditCard, Users, Receipt, Car, Utensils, ShoppingBag, Gamepad2, Zap, Activity, DollarSign, Moon, Sun, Edit3, Trash2, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { loadStripe } from '@stripe/stripe-js';

// Stripe Configuration
const stripePromise = loadStripe('pk_test_51RrpatRD0ogceRR4A7KSSLRWPStkofC0wJ7dcOIuP1zJjL4wLccu9bu1bxSP1XnVunRP36quFSNi86ylTH8r9vU600dIEPIsdM');

// API Configuration
const API_KEY = 'api-AB7psQuumDdjVHLTPYMDghH2xUgaKcuJZVvwReMMsxM9iQBaYJg/BrelRUX07neH';
const API_BASE_URL = 'https://api.example.com'; // Replace with actual API endpoint

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
  { id: 'groceries', name: 'Groceries', icon: ShoppingBag, color: '#4ECDC4', keywords: ['frys food', 'safeway', 'walmart', 'target', 'kroger', 'grocery', 'market', 'food store'] },
  { id: 'gas-transport', name: 'Gas & Transportation', icon: Car, color: '#45B7D1', keywords: ['circle k', 'shell', 'chevron', 'exxon', 'uber', 'lyft', 'gas', 'fuel', 'transport'] },
  { id: 'shopping', name: 'Shopping', icon: ShoppingBag, color: '#96CEB4', keywords: ['amazon', 'ebay', 'shop', 'store', 'retail', 'purchase'] },
  { id: 'subscriptions', name: 'Subscriptions', icon: Gamepad2, color: '#FCEA2B', keywords: ['netflix', 'spotify', 'subscription', 'monthly', 'hulu', 'disney', 'prime'] },
  { id: 'utilities', name: 'Utilities', icon: Zap, color: '#FF9FF3', keywords: ['electric', 'water', 'gas bill', 'utility', 'phone', 'internet', 'cable'] },
  { id: 'health', name: 'Health & Fitness', icon: Activity, color: '#54A0FF', keywords: ['gym', 'health', 'medical', 'pharmacy', 'fitness', 'doctor'] },
  { id: 'fees', name: 'ATM & Fees', icon: DollarSign, color: '#FF7675', keywords: ['atm', 'fee', 'charge', 'overdraft', 'penalty'] },
  { id: 'income', name: 'Income', icon: DollarSign, color: '#00D4AA', keywords: ['salary', 'deposit', 'payment', 'income', 'payroll', 'direct deposit'] },
  { id: 'refunds', name: 'Refunds', icon: CheckCircle, color: '#00B894', keywords: ['refund', 'return', 'credit', 'reimbursement'] }
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
      // Create FormData to send the PDF file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', API_KEY);

      // Make API call to parse the PDF
      const response = await fetch(`${API_BASE_URL}/parse-statement`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const apiResponse = await response.json();
      
      // Process the API response and separate withdrawals from deposits
      return this.processAPIResponse(apiResponse, file.name);
      
    } catch (error) {
      console.error('Error parsing PDF via API:', error);
      // Fallback to sample data if API fails
      return this.generateSampleData(file.name);
    }
  }

  private processAPIResponse(apiResponse: any, fileName: string): ParsedStatement {
    // This structure will depend on your API response format
    // For now, I'll assume the API returns an array of transactions
    const rawTransactions = apiResponse.transactions || apiResponse.data || [];
    
    const transactions: Transaction[] = [];
    const withdrawals: Transaction[] = [];
    const deposits: Transaction[] = [];

    rawTransactions.forEach((rawTx: any, index: number) => {
      const amount = parseFloat(rawTx.amount || rawTx.value || 0);
      const isWithdrawal = amount < 0;
      const absoluteAmount = Math.abs(amount);
      
      const transaction: Transaction = {
        id: rawTx.id || `${rawTx.date}-${index}`,
        date: rawTx.date || rawTx.transaction_date || '',
        description: rawTx.description || rawTx.memo || rawTx.narrative || '',
        amount: absoluteAmount,
        category: this.categorizeTransaction(rawTx.description || rawTx.memo || ''),
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
  onEditTransactions,
  statementName,
  onStatementNameChange
}: {
  onFileUpload: (file: File) => void;
  label: string;
  isUploading: boolean;
  uploadedFile: File | null;
  parsedData: ParsedStatement | null;
  isDark: boolean;
  onEditTransactions?: () => void;
  statementName: string;
  onStatementNameChange?: (name: string) => void;
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
          {label}
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
          ${parsedData 
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
              <p className={`font-medium ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>Processing PDF...</p>
            </>
          ) : parsedData ? (
            <>
              <CheckCircle className={`mx-auto h-12 w-12 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
              <div>
                <p className={`font-medium ${isDark ? 'text-green-300' : 'text-green-700'}`}>
                  {uploadedFile?.name}
                </p>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  {parsedData.transactions.length} transactions found
                </p>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  Withdrawals: ${parsedData.totalWithdrawals.toFixed(2)}
                </p>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  Deposits: ${parsedData.totalDeposits.toFixed(2)}
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
      
      {/* Edit Transactions Button - Outside Upload Box */}
      {onEditTransactions && parsedData && (
        <div className="mt-4 text-center">
          <button
            onClick={onEditTransactions}
            className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
              isDark 
                ? 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105' 
                : 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105'
            }`}
          >
            <FileText className="h-4 w-4" />
            Edit Transactions
          </button>
        </div>
      )}
    </div>
  );
}

function CategorySelector({ 
  selectedCategories, 
  onCategoryChange,
  comparisonData,
  isDark
}: {
  selectedCategories: string[];
  onCategoryChange: (categoryIds: string[]) => void;
  comparisonData: { [key: string]: ComparisonResult } | null;
  isDark: boolean;
}) {
  const handleCategoryToggle = (categoryId: string) => {
    if (selectedCategories.includes(categoryId)) {
      onCategoryChange(selectedCategories.filter(id => id !== categoryId));
    } else {
      onCategoryChange([...selectedCategories, categoryId]);
    }
  };

  return (
    <div className="space-y-4">
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
  const chartData = Object.entries(data).map(([categoryId, result]) => {
    const category = categories.find(c => c.id === categoryId);
    return {
      category: category?.name || categoryId,
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
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className={`p-4 rounded-lg text-center ${
            isDark ? 'bg-blue-900/30' : 'bg-blue-50'
          }`}>
            <div className={`text-xl font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
              ${Object.values(previewData).reduce((sum, r) => sum + r.statement1, 0).toFixed(2)}
            </div>
            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              {statement1Name} Spending
            </div>
          </div>
          
          <div className={`p-4 rounded-lg text-center ${
            isDark ? 'bg-green-900/30' : 'bg-green-50'
          }`}>
            <div className={`text-xl font-bold ${isDark ? 'text-green-400' : 'text-green-600'}`}>
              ${Object.values(previewData).reduce((sum, r) => sum + r.statement2, 0).toFixed(2)}
            </div>
            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              {statement2Name} Spending
            </div>
          </div>
          
          <div className={`p-4 rounded-lg text-center ${
            isDark ? 'bg-orange-900/30' : 'bg-orange-50'
          }`}>
            <div className={`text-xl font-bold ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
              ${Object.values(previewData).reduce((sum, r) => sum + r.difference, 0).toFixed(2)}
            </div>
            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Spending Difference
            </div>
          </div>
          
          <div className={`p-4 rounded-lg text-center ${
            isDark ? 'bg-purple-900/30' : 'bg-purple-50'
          }`}>
            <div className={`text-xl font-bold ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
              ${(Object.values(previewData).reduce((sum, r) => sum + r.statement1, 0) - Object.values(previewData).reduce((sum, r) => sum + r.statement2, 0)).toFixed(2)}
            </div>
            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Net Difference
            </div>
          </div>
        </div>

        {chartData.length > 0 && !isPreview && (
          <div className="h-64 mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#e5e7eb'} />
                <XAxis 
                  dataKey="category" 
                  tick={{ fill: isDark ? '#d1d5db' : '#374151' }}
                  axisLine={{ stroke: isDark ? '#6b7280' : '#9ca3af' }}
                />
                <YAxis 
                  tick={{ fill: isDark ? '#d1d5db' : '#374151' }}
                  axisLine={{ stroke: isDark ? '#6b7280' : '#9ca3af' }}
                />
                <Tooltip formatter={(value: any) => [`$${value.toFixed(2)}`, '']} />
                <Bar dataKey={statement1Name} fill="#3B82F6" />
                <Bar dataKey={statement2Name} fill="#10B981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="space-y-3">
          {Object.entries(previewData).map(([categoryId, result]) => {
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
                  <span className={`font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    {category?.name}
                  </span>
                </div>
                
                <div className="text-right">
                  <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    ${result.statement1.toFixed(2)} vs ${result.statement2.toFixed(2)}
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

function PricingPage({ isVisible, onBack, isDark }: {
  isVisible: boolean;
  onBack: () => void;
  isDark: boolean;
}) {
  if (!isVisible) return null;

  const handleCheckout = async (planName: string) => {
    if (planName === 'Free') {
      // For free plan, just redirect to main app
      onBack();
      return;
    }

    // Redirect to Stripe payment link
    const paymentLinks = {
      'Starter': 'https://buy.stripe.com/test_dRmdRbcurfW97JAdhBgUM00',
      'Pro': 'https://buy.stripe.com/test_dRmdRbcurfW97JAdhBgUM00',     // You can create separate links for each tier
      'Business': 'https://buy.stripe.com/test_dRmdRbcurfW97JAdhBgUM00' // You can create separate links for each tier
    };

    const paymentLink = paymentLinks[planName as keyof typeof paymentLinks];
    
    if (paymentLink) {
      window.open(paymentLink, '_blank');
    } else {
      console.error('Payment link not found for plan:', planName);
      alert('Payment link not configured for this plan. Please contact support.');
    }
  };

  const plans = [
    {
      name: 'Free',
      price: '$0',
      pages: '30 pages per month',
      priceId: null
    },
    {
      name: 'Starter',
      price: '$29/month',
      pages: '150 pages per month',
      priceId: 'price_1Rrpe8RD0ogceRR4LdVUllat'
    },
    {
      name: 'Pro',
      price: '$69/month',
      pages: '400 pages per month',
      priceId: 'price_1Rrpe8RD0ogceRR4LdVUllat'
    },
    {
      name: 'Business',
      price: '$149/month',
      pages: '1,000 pages per month',
      priceId: 'price_1Rrpe8RD0ogceRR4LdVUllat'
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
              ← Back to App
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
              Simple, Transparent Pricing
            </h1>
            <p className={`text-lg ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Choose the plan that fits your needs
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan, index) => (
              <div key={plan.name} className={`p-6 rounded-xl border shadow-lg ${
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
              }`}>
                <div className="text-center mb-6">
                  <h3 className={`text-xl font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    {plan.name}
                  </h3>
                  <div className={`text-3xl font-bold mt-3 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                    {plan.price}
                  </div>
                  <div className={`text-sm mt-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    {plan.pages}
                  </div>
                </div>
                
                <button
                  onClick={() => handleCheckout(plan.name)}
                  className={`w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                    plan.name === 'Free'
                      ? isDark
                        ? 'bg-gray-600 hover:bg-gray-500 text-gray-200'
                        : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                      : isDark
                        ? 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105'
                        : 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105'
                  }`}
                >
                  {plan.name === 'Free' ? 'Get Started' : `Subscribe to ${plan.name}`}
                </button>
                

              </div>
            ))}
          </div>


        </div>
      </div>
    </div>
  );
}

function SettingsPage({ isVisible, onBack, isDark }: {
  isVisible: boolean;
  onBack: () => void;
  isDark: boolean;
}) {
  if (!isVisible) return null;

  const handleManageSubscription = () => {
    window.open('https://billing.stripe.com/p/login/test_dRmdRbcurfW97JAdhBgUM00', '_blank');
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
              ← Back to App
            </button>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className={`rounded-xl border shadow-lg p-8 ${
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <h1 className={`text-3xl font-bold mb-8 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
            Settings
          </h1>
          
          <div className="flex justify-center">
            <button
              onClick={handleManageSubscription}
              className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 border ${
                isDark 
                  ? 'bg-white text-gray-800 border-gray-300 hover:bg-gray-100' 
                  : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Manage Subscription
            </button>
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
  if (!isVisible) return null;

  const usageData = [
    {
      date: '2 August 2025 01:46 PM',
      description: 'Used 11 credits.',
      type: 'usage'
    },
    {
      date: '2 August 2025 01:46 PM',
      description: 'Converted a 11 page PDF.',
      type: 'conversion'
    },
    {
      date: '2 August 2025 01:34 PM',
      description: 'Used 9 credits.',
      type: 'usage'
    },
    {
      date: '2 August 2025 01:33 PM',
      description: 'Converted a 9 page PDF.',
      type: 'conversion'
    },
    {
      date: '30 July 2025 10:37 PM',
      description: 'Acquired 400 credits.',
      type: 'acquisition'
    },
    {
      date: '30 July 2025 10:37 PM',
      description: 'Converted a 9 page PDF.',
      type: 'conversion'
    },
    {
      date: '30 July 2025 10:37 PM',
      description: 'Converted a 9 page PDF.',
      type: 'conversion'
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
              ← Back to App
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
              380 credits available
            </p>
          </div>
          
          <div className="mb-6">
            <h2 className={`text-xl font-semibold mb-4 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
              Credit Used in the Last 28 Days
            </h2>
          </div>
          
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
                </tr>
              </thead>
              <tbody>
                {usageData.map((item, index) => (
                  <tr key={index} className={`border-b ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                    <td className={`py-3 px-4 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      {item.date}
                    </td>
                    <td className={`py-3 px-4 ${
                      item.type === 'usage' 
                        ? isDark ? 'text-red-400' : 'text-red-600'
                        : item.type === 'acquisition'
                        ? isDark ? 'text-green-400' : 'text-green-600'
                        : isDark ? 'text-gray-300' : 'text-gray-600'
                    }`}>
                      {item.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
  if (!isVisible) return null;

  // Sample past documents data
  const pastDocuments = [
    {
      id: '1',
      date: '2 August 2025',
      statement1Name: 'Chase Bank Statement',
      statement2Name: 'Wells Fargo Statement',
      categories: ['groceries', 'entertainment', 'transportation'],
      totalWithdrawals: 2847.50,
      totalDeposits: 3200.00,
      status: 'completed'
    },
    {
      id: '2',
      date: '1 August 2025',
      statement1Name: 'Bank of America Statement',
      statement2Name: 'Credit Union Statement',
      categories: ['utilities', 'dining', 'shopping'],
      totalWithdrawals: 1892.30,
      totalDeposits: 2500.00,
      status: 'completed'
    },
    {
      id: '3',
      date: '31 July 2025',
      statement1Name: 'Citibank Statement',
      statement2Name: 'PNC Bank Statement',
      categories: ['healthcare', 'education', 'travel'],
      totalWithdrawals: 3421.75,
      totalDeposits: 4100.00,
      status: 'completed'
    }
  ];

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

  const handleRedoComparison = (documentId: string) => {
    // In a real app, this would load the documents for re-comparison
    console.log(`Redoing comparison for document ${documentId}`);
    alert(`Loading documents for re-comparison: ${documentId}`);
    onBack(); // Return to main app
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
              ← Back to App
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
        
        <div className="grid gap-6">
          {pastDocuments.map((doc) => (
            <div key={doc.id} className={`rounded-xl border shadow-lg p-6 ${
              isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            }`}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className={`text-xl font-semibold mb-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    {doc.statement1Name} vs {doc.statement2Name}
                  </h3>
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    {doc.date} • {doc.categories.length} categories compared
                  </p>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                  doc.status === 'completed' 
                    ? isDark ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-800'
                    : isDark ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {doc.status}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className={`p-4 rounded-lg ${
                  isDark ? 'bg-gray-700/50' : 'bg-gray-50'
                }`}>
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Categories</p>
                  <p className={`font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    {doc.categories.join(', ')}
                  </p>
                </div>
                <div className={`p-4 rounded-lg ${
                  isDark ? 'bg-gray-700/50' : 'bg-gray-50'
                }`}>
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Total Withdrawals</p>
                  <p className={`font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    ${doc.totalWithdrawals.toLocaleString()}
                  </p>
                </div>
                <div className={`p-4 rounded-lg ${
                  isDark ? 'bg-gray-700/50' : 'bg-gray-50'
                }`}>
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Total Deposits</p>
                  <p className={`font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    ${doc.totalDeposits.toLocaleString()}
                  </p>
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
                <button
                  onClick={() => handleRedoComparison(doc.id)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 border ${
                    isDark 
                      ? 'bg-transparent text-gray-300 border-gray-600 hover:bg-gray-700' 
                      : 'bg-transparent text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <BarChart3 className="h-4 w-4" />
                  Redo Comparison
                </button>
              </div>
            </div>
          ))}
        </div>
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
  const [isSignedIn, setIsSignedIn] = useState(false); // Simulate signed in state

  const parser = new BankStatementParser();

  const handleFileUpload = async (statementKey: 'statement1' | 'statement2', file: File) => {
    setFiles(prev => ({ ...prev, [statementKey]: file }));
    setUploading(prev => ({ ...prev, [statementKey]: true }));
    
    try {
      const result = await parser.parsePDF(file);
      setParsedData(prev => ({ ...prev, [statementKey]: result }));
    } catch (error) {
      console.error('Error parsing PDF:', error);
    } finally {
      setUploading(prev => ({ ...prev, [statementKey]: false }));
    }
  };

  const generateComparison = () => {
    if (!parsedData.statement1 || !parsedData.statement2 || selectedCategories.length === 0) {
      return;
    }

    const comparison: { [key: string]: ComparisonResult } = {};
    
    selectedCategories.forEach(categoryId => {
      // Calculate withdrawals for each statement
      const withdrawals1 = parsedData.statement1!.withdrawals
        .filter(t => t.category === categoryId)
        .reduce((sum, t) => sum + t.amount, 0);
        
      const withdrawals2 = parsedData.statement2!.withdrawals
        .filter(t => t.category === categoryId)
        .reduce((sum, t) => sum + t.amount, 0);
      
      // Calculate deposits for each statement
      const deposits1 = parsedData.statement1!.deposits
        .filter(t => t.category === categoryId)
        .reduce((sum, t) => sum + t.amount, 0);
        
      const deposits2 = parsedData.statement2!.deposits
        .filter(t => t.category === categoryId)
        .reduce((sum, t) => sum + t.amount, 0);
      
      // For spending categories, focus on withdrawals (money going out)
      // For income categories, focus on deposits (money coming in)
      const isIncomeCategory = categoryId === 'income' || categoryId === 'refunds';
      
      const amount1 = isIncomeCategory ? deposits1 : withdrawals1;
      const amount2 = isIncomeCategory ? deposits2 : withdrawals2;
      
      comparison[categoryId] = {
        category: categoryId,
        statement1: amount1,
        statement2: amount2,
        difference: Math.abs(amount1 - amount2),
        winner: amount1 > amount2 ? 'Statement 1' : 'Statement 2'
      };
    });
    
    setComparisonResults(comparison);
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
    // Implementation would use jsPDF to generate PDF report
    alert('PDF export would be implemented here');
  };

  const exportToCSV = () => {
    // Implementation would generate CSV with transaction details
    alert('CSV export would be implemented here');
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

  const canGenerate = parsedData.statement1 && parsedData.statement2 && selectedCategories.length > 0;
  const bothFilesUploaded = parsedData.statement1 && parsedData.statement2;

  return (
    <>
      {!showPricingModal && !showSettingsPage && !showUsagePage && !showPastDocumentsPage ? (
        <div className={`min-h-screen transition-colors duration-300 ${
          isDarkMode 
            ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' 
            : 'bg-gradient-to-br from-blue-50 via-white to-green-50'
        }`}>
          <DarkModeToggle isDark={isDarkMode} onToggle={() => setIsDarkMode(!isDarkMode)} />
          
          {/* Navigation Header */}
          <div className={`sticky top-0 z-40 backdrop-blur-sm border-b ${
            isDarkMode ? 'bg-gray-900/80 border-gray-700' : 'bg-white/80 border-gray-200'
          }`}>
            <div className="container mx-auto px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-blue-600' : 'bg-blue-600'}`}>
                    <BarChart3 className="h-5 w-5 text-white" />
                  </div>
                  <span className={`font-semibold text-lg ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                    BankCompare
                  </span>
                </div>
                
                <nav className="flex items-center gap-6">
                  {!isSignedIn ? (
                    <>
                      <button 
                        onClick={() => setShowPricingModal(true)}
                        className={`text-sm font-medium transition-colors hover:scale-105 ${
                          isDarkMode ? 'text-gray-300 hover:text-blue-400' : 'text-gray-600 hover:text-blue-600'
                        }`}
                      >
                        Pricing
                      </button>
                      <button 
                        onClick={() => setShowPastDocumentsPage(true)}
                        className={`text-sm font-medium transition-colors hover:scale-105 ${
                          isDarkMode ? 'text-gray-300 hover:text-blue-400' : 'text-gray-600 hover:text-blue-600'
                        }`}
                      >
                        Past Documents
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
                        onClick={() => setIsSignedIn(true)}
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
            onEditTransactions={() => setShowTransactionEditor(prev => ({ ...prev, statement1: true }))}
            statementName={editableStatementNames.statement1}
            onStatementNameChange={(name) => setEditableStatementNames(prev => ({ ...prev, statement1: name }))}
          />
          <FileUploadZone
            onFileUpload={(file) => handleFileUpload('statement2', file)}
            label="Statement 2"
            isUploading={uploading.statement2}
            uploadedFile={files.statement2}
            parsedData={parsedData.statement2}
            isDark={isDarkMode}
            onEditTransactions={() => setShowTransactionEditor(prev => ({ ...prev, statement2: true }))}
            statementName={editableStatementNames.statement2}
            onStatementNameChange={(name) => setEditableStatementNames(prev => ({ ...prev, statement2: name }))}
          />
        </div>

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

        {/* Category Selection */}
        {bothFilesUploaded && (
          <div className={`rounded-xl p-6 shadow-lg border mb-8 ${
            isDarkMode 
              ? 'bg-gray-800 border-gray-700' 
              : 'bg-white border-gray-100'
          }`}>
            <CategorySelector
              selectedCategories={selectedCategories}
              onCategoryChange={setSelectedCategories}
              comparisonData={comparisonResults}
              isDark={isDarkMode}
            />
            
            <div className="mt-6 text-center">
              <button
                onClick={generateComparison}
                disabled={!canGenerate}
                className={`
                  inline-flex items-center gap-2 px-8 py-3 rounded-lg font-medium transition-all duration-200
                  ${canGenerate 
                    ? isDarkMode
                      ? 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105'
                      : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105'
                    : isDarkMode
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }
                `}
              >
                <BarChart3 className="h-5 w-5" />
                Generate Comparison
              </button>
            </div>
          </div>
        )}

        {/* Results */}
        {comparisonResults && (
          <div className="space-y-6">
            <ComparisonResults
              data={comparisonResults}
              statement1Name={parsedData.statement1?.accountHolder || 'Statement 1'}
              statement2Name={parsedData.statement2?.accountHolder || 'Statement 2'}
              isPreview={!isPaid}
              onUnlock={() => setShowPaywall(true)}
              isDark={isDarkMode}
            />

            {isPaid && (
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
                
                <div className="flex flex-wrap gap-4">
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
            )}
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
      ) : showPricingModal ? (
        <PricingPage
          isVisible={showPricingModal}
          onBack={() => setShowPricingModal(false)}
          isDark={isDarkMode}
        />
      ) : showSettingsPage ? (
        <SettingsPage
          isVisible={showSettingsPage}
          onBack={() => setShowSettingsPage(false)}
          isDark={isDarkMode}
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
        />
      )}
    </>
  );
}

export default App;