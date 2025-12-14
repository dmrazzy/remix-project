'use strict'
import { Plugin } from '@remixproject/engine'
import { Transaction, EventManager, execution, Registry } from '@remix-project/remix-lib'

const { TxRunnerWeb3 } = execution
const profile = {
  name: 'txRunner',
  displayName: 'TxRunner',
  description: 'Transaction deployments',
  methods: ['resetInternalRunner', 'getPendingTransactions', 'rawRun'],
  events: []
}

export class TxRunner extends Plugin {
  event
  pendingTxs
  queueTxs
  opt = {}
  internalRunner

  constructor () {
    super(profile)
    this.event = new EventManager()

    this.pendingTxs = {}
    this.queueTxs = []
  }

  resetInternalRunner() {
    this.internalRunner = new TxRunnerWeb3(this)
  }

  setRunnerOptions(runnerOptions) {
    this.opt = runnerOptions
  }

  getPendingTransactions() {
    return this.pendingTxs
  }

  rawRun (args: Transaction) {
    this.run(args, args.timestamp || Date.now())
  }

  execute (args: Transaction) {
    if (!args.data) args.data = '0x'
    if (args.data.slice(0, 2) !== '0x') args.data = '0x' + args.data
    if (args.deployedBytecode && args.deployedBytecode.slice(0, 2) !== '0x') {
      args.deployedBytecode = '0x' + args.deployedBytecode
    }
    this.internalRunner.execute(args)
  }

  async run (tx: Transaction, stamp) {
    if (Object.keys(this.pendingTxs).length) {
      return this.queueTxs.push({ tx, stamp })
    }
    this.pendingTxs[stamp] = tx
    return await this.execute(tx)
    // delete this.pendingTxs[stamp]
    // if (this.queueTxs.length) {
    //   const next = this.queueTxs.pop()
    //   await this.run(next.tx, next.stamp)
    // }
  }
}
