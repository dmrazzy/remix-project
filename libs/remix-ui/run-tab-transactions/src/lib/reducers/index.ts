import { Actions, TransactionsWidgetState } from '../types'

export const transactionsInitialState: TransactionsWidgetState = {
  activeTab: 'Active',
  sortOrder: 'newest',
  transactions: new Map(),
  isRecording: true,
  deployments: []
}

export const transactionsReducer = (state: TransactionsWidgetState, action: Actions): TransactionsWidgetState => {
  switch (action.type) {
  case 'SET_ACTIVE_TAB':
    return { ...state, activeTab: action.payload }

  case 'SET_SORT_ORDER':
    return { ...state, sortOrder: action.payload }

  case 'ADD_TRANSACTION': {
    const newTransactions = new Map(state.transactions)
    const contractAddress = action.payload.contractAddress || action.payload.to || ''
    const existing = newTransactions.get(contractAddress) || []
    newTransactions.set(contractAddress, [...existing, action.payload])
    return { ...state, transactions: newTransactions }
  }

  case 'UPDATE_TRANSACTION': {
    const newTransactions = new Map(state.transactions)
    for (const [address, txs] of newTransactions.entries()) {
      const index = txs.findIndex(tx => tx.hash === action.payload.hash)
      if (index !== -1) {
        const updatedTxs = [...txs]
        updatedTxs[index] = { ...updatedTxs[index], ...action.payload.updates }
        newTransactions.set(address, updatedTxs)
        break
      }
    }
    return { ...state, transactions: newTransactions }
  }

  case 'REMOVE_TRANSACTION': {
    const newTransactions = new Map(state.transactions)
    for (const [address, txs] of newTransactions.entries()) {
      const filtered = txs.filter(tx => tx.hash !== action.payload)
      if (filtered.length !== txs.length) {
        newTransactions.set(address, filtered)
        break
      }
    }
    return { ...state, transactions: newTransactions }
  }

  case 'CLEAR_TRANSACTIONS':
    return { ...state, transactions: new Map() }

  case 'SET_RECORDING':
    return { ...state, isRecording: action.payload }

  case 'SET_DEPLOYMENTS':
    return { ...state, deployments: action.payload }

  default:
    return state
  }
}
