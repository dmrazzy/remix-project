import React from 'react'
import { trackMatomoEvent } from '@remix-api'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { TransactionsPlugin } from 'apps/remix-ide/src/app/udapp/udappTransactions'
import { Actions, Transaction } from '../types'

export async function addTransaction(
  plugin: TransactionsPlugin,
  dispatch: React.Dispatch<Actions>,
  transaction: Transaction
) {
  dispatch({ type: 'ADD_TRANSACTION', payload: transaction })

  trackMatomoEvent(plugin, {
    category: 'udapp',
    action: 'recordTransaction',
    name: transaction.status || 'pending',
    isClick: false
  })
}

export async function updateTransaction(
  plugin: TransactionsPlugin,
  dispatch: React.Dispatch<Actions>,
  hash: string,
  updates: Partial<Transaction>
) {
  dispatch({ type: 'UPDATE_TRANSACTION', payload: { hash, updates } })
}

export async function removeTransaction(
  plugin: TransactionsPlugin,
  dispatch: React.Dispatch<Actions>,
  hash: string
) {
  dispatch({ type: 'REMOVE_TRANSACTION', payload: hash })
}

export async function clearAllTransactions(
  plugin: TransactionsPlugin,
  dispatch: React.Dispatch<Actions>
) {
  plugin.call('notification', 'modal', {
    id: 'clearTransactions',
    title: 'Clear All Transactions',
    message: 'Are you sure you want to clear all recorded transactions?',
    okLabel: 'Clear',
    cancelLabel: 'Cancel',
    okFn: async () => {
      dispatch({ type: 'CLEAR_TRANSACTIONS', payload: null })
      await plugin.call('notification', 'toast', 'All transactions cleared')

      trackMatomoEvent(plugin, {
        category: 'udapp',
        action: 'clearTransactions',
        name: 'clearAll',
        isClick: true
      })
    }
  })
}

export async function exportTransactions(
  plugin: TransactionsPlugin,
  transactions: Transaction[]
) {
  try {
    const content = JSON.stringify(transactions, null, 2)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `transactions-${timestamp}.json`

    await plugin.call('fileManager', 'writeFile', fileName, content)
    await plugin.call('notification', 'toast', `Transactions exported to ${fileName}`)

    trackMatomoEvent(plugin, {
      category: 'udapp',
      action: 'exportTransactions',
      name: 'export',
      isClick: true
    })
  } catch (error) {
    console.error('Error exporting transactions:', error)
    await plugin.call('notification', 'toast', `Error exporting transactions: ${error.message}`)
  }
}

export async function toggleRecording(
  plugin: TransactionsPlugin,
  dispatch: React.Dispatch<Actions>,
  isRecording: boolean
) {
  dispatch({ type: 'SET_RECORDING', payload: !isRecording })

  trackMatomoEvent(plugin, {
    category: 'udapp',
    action: 'toggleRecording',
    name: !isRecording ? 'start' : 'stop',
    isClick: true
  })
}
