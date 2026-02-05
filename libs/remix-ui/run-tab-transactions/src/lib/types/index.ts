import React from 'react'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import type { TransactionsPlugin } from 'apps/remix-ide/src/app/udapp/udappTransactions'

export type TabType = 'Active' | 'Saved'
export type SortOrder = 'newest' | 'oldest'

export interface Transaction {
  hash: string
  timestamp: number
  status?: string
  from?: string
  to?: string
  value?: string
  gasUsed?: string
  blockNumber?: number
  contractAddress?: string
  functionName?: string
  parameters?: any[]
  logs?: any[]
  decodedOutput?: any
}

export interface Deployment {
  address: string
  name: string
  timestamp: number
  abi?: any[]
  bytecode?: string
  network?: string
}

export interface TransactionsWidgetState {
  activeTab: TabType
  sortOrder: SortOrder
  transactions: Map<string, Transaction[]>
  isRecording: boolean
  deployments: Deployment[]
}

export interface TransactionsAppContextType {
  widgetState: TransactionsWidgetState
  dispatch: React.Dispatch<Actions>
  plugin: TransactionsPlugin
  themeQuality: string
}

export type Actions =
  | { type: 'SET_ACTIVE_TAB'; payload: TabType }
  | { type: 'SET_SORT_ORDER'; payload: SortOrder }
  | { type: 'ADD_TRANSACTION'; payload: Transaction }
  | { type: 'UPDATE_TRANSACTION'; payload: { hash: string; updates: Partial<Transaction> } }
  | { type: 'REMOVE_TRANSACTION'; payload: string }
  | { type: 'CLEAR_TRANSACTIONS'; payload: null }
  | { type: 'SET_RECORDING'; payload: boolean }
  | { type: 'SET_DEPLOYMENTS'; payload: Deployment[] }
