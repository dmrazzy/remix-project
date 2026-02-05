import React from 'react'
import { Plugin } from '@remixproject/engine'
import { Actions, TransactionsWidget } from '@remix-ui/run-tab-transactions'

const profile = {
  name: 'udappTransactions',
  displayName: 'Transactions Recorder',
  description: 'Manages the UI and state for transaction recording',
  methods: ['getUI'],
  events: []
}

export class TransactionsPlugin extends Plugin {
  private getDispatch: (() => React.Dispatch<Actions>) | null = null

  constructor() {
    super(profile)
  }

  getUI() {
    return <TransactionsWidget plugin={this} />
  }
}
