import React from 'react'
import { Plugin } from '@remixproject/engine'
import { Actions, TransactionsWidget, TransactionsWidgetState, replayTransaction, RecorderData, Transaction } from '@remix-ui/run-tab-transactions'

const profile = {
  name: 'udappTransactions',
  displayName: 'Transactions Recorder',
  description: 'Manages the UI and state for transaction recording',
  methods: ['getUI', 'getTransactionRecorderCount', 'runScenario'],
  events: ['transactionRecorderUpdated']
}

/**
  * Record transaction as long as the user create them.
  */
export class TransactionsPlugin extends Plugin {
  getWidgetState: (() => TransactionsWidgetState) | null = null
  private _getDispatch: (() => React.Dispatch<Actions>) | null = null

  constructor () {
    super(profile)
  }

  setStateGetter(getter: () => TransactionsWidgetState) {
    this.getWidgetState = getter
  }

  setDispatchGetter(getter: () => React.Dispatch<Actions>) {
    this._getDispatch = getter
  }

  getDispatch() {
    return this._getDispatch?.()
  }

  getTransactionRecorderCount() {
    return this.getWidgetState()?.recorderData.journal.length || 0
  }

  async runScenario(scenario: any) {
    try {
      if (!scenario) {
        throw new Error('A scenario is required')
      }

      // Validate scenario structure
      if (!scenario.transactions || !Array.isArray(scenario.transactions)) {
        throw new Error('Invalid scenario: transactions array is required')
      }

      if (scenario.transactions.length === 0) {
        throw new Error('No transactions found in scenario')
      }

      // Build RecorderData from scenario
      const recorderData: RecorderData = {
        journal: scenario.transactions || [],
        _createdContracts: {},
        _createdContractsReverse: {},
        _usedAccounts: scenario.accounts || {},
        _abis: scenario.abis || {},
        _contractABIReferences: {},
        _linkReferences: scenario.linkReferences || {}
      }

      // Build _contractABIReferences and _createdContracts from transactions
      scenario.transactions.forEach((tx: Transaction) => {
        if (tx.record.type === 'constructor' && tx.record.abi && tx.timestamp) {
          recorderData._contractABIReferences[tx.timestamp] = tx.record.abi
        }
      })

      const dispatch = this.getDispatch?.()
      if (!dispatch) {
        throw new Error('Dispatch not available')
      }

      await this.call('notification', 'toast', `Replaying ${scenario.transactions.length} transaction(s)...`)

      // Replay each transaction
      for (let i = 0; i < scenario.transactions.length; i++) {
        const transaction = scenario.transactions[i]
        try {
          await replayTransaction(transaction, recorderData, this, dispatch)

          // If it's a contract deployment, update the _createdContracts
          if (transaction.record.type === 'constructor' && transaction.record.targetAddress) {
            recorderData._createdContracts[transaction.record.targetAddress] = transaction.timestamp
            recorderData._createdContractsReverse[transaction.timestamp] = transaction.record.targetAddress
          }
        } catch (error) {
          console.error(`Error replaying transaction ${i + 1}:`, error)
          await this.call('notification', 'toast', `Error replaying transaction ${i + 1}: ${error.message}`)
          throw error
        }
      }

      await this.call('notification', 'toast', `Successfully replayed ${scenario.transactions.length} transaction(s)`)
    } catch (error) {
      console.error('Error running scenario:', error)
      await this.call('notification', 'toast', `Error running scenario: ${error.message}`)
      throw error
    }
  }

  getUI() {
    return <TransactionsWidget plugin={this} />
  }
}
