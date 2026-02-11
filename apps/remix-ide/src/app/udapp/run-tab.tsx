/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { createElement } from 'react' // eslint-disable-line
import { createPortal } from 'react-dom'
import { RunTabUI } from '@remix-ui/run-tab'
import { trackMatomoEvent } from '@remix-api'
import { ViewPlugin } from '@remixproject/engine-web'
import { addressToString, PluginViewWrapper } from '@remix-ui/helper'
import * as packageJson from '../../../../../package.json'
import { EventManager } from '@remix-project/remix-lib'
import type { Blockchain } from '../../blockchain/blockchain'
import type { CompilerArtefacts } from '@remix-project/core-plugin'
import { Recorder } from '../tabs/runTab/model/recorder'

const profile = {
  name: 'udapp',
  displayName: 'Deploy & run transactions',
  icon: 'assets/img/deployAndRun.webp',
  description: 'Execute, save and replay transactions',
  kind: 'udapp',
  location: 'sidePanel',
  documentation: 'https://remix-ide.readthedocs.io/en/latest/run.html',
  version: packageJson.version,
  maintainedBy: 'Remix',
  permission: true,
  events: ['newTransaction'],
  methods: [
    'createVMAccount',
    'sendTransaction',
    'pendingTransactionsCount',
    'getSettings',
    'setEnvironmentMode',
    'clearAllInstances',
    'showPluginDetails',
    'getRunTabAPI',
    'getDeployedContracts',
    'getAllDeployedInstances',
    'setAccount'
  ]
}

export class RunTab extends ViewPlugin {
  event: EventManager
  engine: any
  config: any
  blockchain: Blockchain
  fileManager: any
  editor: any
  filePanel: any
  compilersArtefacts: CompilerArtefacts
  networkModule: any
  fileProvider: any
  recorder: any
  REACT_API: any
  el: any
  allTransactionHistory: Map<string, any> = new Map()

  private dispatch: (state: any) => void = () => {}
  private envUI: React.ReactNode = null
  private deployUI: React.ReactNode = null
  private deployedContractsUI: React.ReactNode = null
  private transactionsUI: React.ReactNode = null

  constructor(blockchain: Blockchain, config: any, fileManager: any, editor: any, filePanel: any, compilersArtefacts: CompilerArtefacts, networkModule: any, fileProvider: any, engine: any) {
    super(profile)
    this.event = new EventManager()
    this.engine = engine
    this.config = config
    this.blockchain = blockchain
    this.fileManager = fileManager
    this.editor = editor
    this.filePanel = filePanel
    this.compilersArtefacts = compilersArtefacts
    this.networkModule = networkModule
    this.fileProvider = fileProvider
    this.recorder = new Recorder(blockchain)
    this.REACT_API = {}
    this.setupEvents()
    this.el = document.createElement('div')
  }

  setupEvents() {
    this.blockchain.events.on('newTransaction', (tx, receipt) => {
      this.emit('newTransaction', tx, receipt)
    })
  }

  onActivation(): void {
    this.on('manager', 'activate', async (profile: { name: string }) => {
      if (profile.name === 'udappEnv') {
        this.envUI = await this.call('udappEnv', 'getUI', this.engine, this.blockchain)
        this.renderComponent()
      }
      if (profile.name === 'udappDeploy') {
        this.deployUI = await this.call('udappDeploy', 'getUI')
        this.renderComponent()
      }
      if (profile.name === 'udappDeployedContracts') {
        this.deployedContractsUI = await this.call('udappDeployedContracts', 'getUI')
        this.renderComponent()
      }
      if (profile.name === 'udappTransactions') {
        this.transactionsUI = await this.call('udappTransactions', 'getUI')
        this.renderComponent()
      }
    })
    // Listen for transaction execution events to collect deployment data
    this.on('blockchain','transactionExecuted', (error, from, to, data, useCall, result, timestamp, payload) => {
      console.log('[UDAPP] Transaction execution detected:', result.receipt.hash)

      if (!error && result && result.receipt && result.receipt.contractAddress) {

        // Store deployment transaction data
        const deploymentData = {
          transactionHash: result.receipt.transactionHash,
          blockHash: result.receipt.blockHash,
          blockNumber: result.receipt.blockNumber,
          gasUsed: result.receipt.gasUsed,
          gasPrice: result.receipt.gasPrice || result.receipt.effectiveGasPrice || '0',
          from: from,
          to: to,
          timestamp: timestamp,
          status: result.receipt.status ? 'success' : 'failed',
          constructorArgs: payload?.contractGuess?.constructorArgs || [],
          contractName: payload?.contractData?.name || payload?.contractGuess?.name || 'Unknown',
          value: result.receipt.value || '0'
        }

        this.allTransactionHistory.set(result.receipt.contractAddress, deploymentData)
      }
    })
  }

  getSettings() {
    return new Promise((resolve, reject) => {
      resolve({
        selectedAccount: this.REACT_API.accounts.selectedAccount,
        selectedEnvMode: this.REACT_API.selectExEnv,
        networkEnvironment: this.REACT_API.networkName
      })
    })
  }

  showPluginDetails() {
    return profile
  }

  async setEnvironmentMode(env) {
    const canCall = await this.askUserPermission('setEnvironmentMode', 'change the environment used')
    if (canCall) {
      env = typeof env === 'string' ? { context: env } : env
      this.emit('setEnvironmentModeReducer', env, this.currentRequest.from)
      this.allTransactionHistory.clear()
    }
  }

  clearAllInstances() {
    this.emit('clearAllInstancesReducer')
    this.allTransactionHistory.clear()
  }

  setDispatch(dispatch: (state: any) => void) {
    this.dispatch = dispatch
    this.renderComponent()
  }

  renderComponent() {
    this.dispatch && this.dispatch({
      ...this,
      envUI: this.envUI,
      deployUI: this.deployUI,
      deployedContractsUI: this.deployedContractsUI,
      transactionsUI: this.transactionsUI
    })
  }

  updateComponent() {
    return (<>
      { this.envUI && createPortal(this.envUI, document.getElementById('udappEnvComponent')) }
      { this.deployUI && createPortal(this.deployUI, document.getElementById('udappDeployComponent')) }
      { this.deployedContractsUI && createPortal(this.deployedContractsUI, document.getElementById('udappDeployedContractsComponent')) }
      { this.transactionsUI && createPortal(this.transactionsUI, document.getElementById('udappTransactionsComponent')) }
    </>)
  }

  render() {
    return (
      <div id="runTabView" style={{ position: 'relative', height: '100%', overflow: 'auto' }}>
        <div id="udappEnvComponent" style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--body-bg)' }}></div>
        <div id="udappDeployComponent"></div>
        <div id="udappDeployedContractsComponent"></div>
        <div id="udappTransactionsComponent"></div>
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }
}
