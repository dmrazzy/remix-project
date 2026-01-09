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

export const providerLogos = {
  'injected-metamask-optimism': ['assets/img/optimism-ethereum-op-logo.png', 'assets/img/metamask.png'],
  'injected-metamask-arbitrum': ['assets/img/arbitrum-arb-logo.png', 'assets/img/metamask.png'],
  'injected-metamask-gnosis': ['assets/img/gnosis_chain.png', 'assets/img/metamask.png'],
  'injected-metamask-chiado': ['assets/img/gnosis_chain.png', 'assets/img/metamask.png'],
  'injected-metamask-linea': ['assets/img/linea_chain.png', 'assets/img/metamask.png'],
  'injected-metamask-sepolia': ['assets/img/metamask.png'],
  'injected-metamask-ephemery': ['assets/img/metamask.png'],
  'injected-MetaMask': ['assets/img/metamask.png'],
  'injected-Brave Wallet': ['assets/img/brave.png'],
  'injected-Trust Wallet': ['assets/img/trust-wallet.png'],
  'hardhat-provider': ['assets/img/hardhat.png'],
  'walletconnect': ['assets/img/Walletconnect-logo.png'],
  'foundry-provider': ['assets/img/foundry.png']
}

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
    'addInstance',
    'resolveContractAndAddInstance',
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
        this.deployUI = await this.call('udappDeploy', 'getUI', this.engine, this.blockchain, this.compilersArtefacts, this.editor, this.fileManager)
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

  setAccount(address: string) {
    this.emit('setAccountReducer', address)
  }

  getAllDeployedInstances() {
    return this.REACT_API.instances?.instanceList
  }

  clearAllInstances() {
    this.emit('clearAllInstancesReducer')
    this.allTransactionHistory.clear()
  }

  addInstance(address, abi, name, contractData?) {
    this.emit('addInstanceReducer', address, abi, name, contractData)
  }

  createVMAccount(newAccount) {
    return this.blockchain.createVMAccount(newAccount)
  }

  sendTransaction(tx) {
    trackMatomoEvent(this, { category: 'udapp', action: 'sendTx', name: 'udappTransaction', isClick: true })
    return this.blockchain.sendTransaction(tx)
  }

  getRunTabAPI(){
    return this.REACT_API;
  }

  getDeployedContracts() {
    if (!this.REACT_API || !this.REACT_API.instances) {
      return {};
    }
    const instances = this.REACT_API.instances.instanceList || [];
    const deployedContracts = {};
    const currentProvider = this.REACT_API.selectExEnv || 'vm-london';

    deployedContracts[currentProvider] = {};

    instances.forEach((instance, index) => {
      if (instance && instance.address) {
        const txData = this.allTransactionHistory.get(instance.address)

        const contractInstance = {
          name: instance.name || txData?.contractName || 'Unknown',
          address: instance.address,
          abi: instance.contractData?.abi || instance.abi || [],
          timestamp: txData?.timestamp ? new Date(txData.timestamp).toISOString() : new Date().toISOString(),
          from: txData?.from || this.REACT_API.accounts?.selectedAccount || 'unknown',
          transactionHash: txData?.transactionHash || 'unknown',
          blockHash: txData?.blockHash,
          blockNumber: Number(txData?.blockNumber) || 0,
          gasUsed: Number(txData?.gasUsed)|| 0,
          gasPrice: txData?.gasPrice || '0',
          value: txData?.value || '0',
          status: txData?.status || 'unknown',
          constructorArgs: txData?.constructorArgs || [],
          verified: false,
          index: index
        }

        deployedContracts[currentProvider][instance.address] = contractInstance
      }
    });

    return deployedContracts;
  }

  setDispatch(dispatch: (state: any) => void) {
    this.dispatch = dispatch
    this.renderComponent()
  }

  renderComponent() {
    this.dispatch && this.dispatch({
      ...this,
      onReady: this.onReady,
      envUI: this.envUI,
      deployUI: this.deployUI
    })
  }

  updateComponent(state: any) {
    return (<>
      <RunTabUI plugin={state} />
      { this.envUI && createPortal(this.envUI, document.getElementById('udappEnvComponent')) }
      { this.deployUI && createPortal(this.deployUI, document.getElementById('udappDeployComponent')) }
    </>)
  }

  render() {
    return (
      <div>
        <div id="udappEnvComponent"></div>
        <div id="udappDeployComponent"></div>
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }

  onReady(api) {
    this.REACT_API = api
  }

  writeFile(fileName, content) {
    return this.call('fileManager', 'writeFile', fileName, content)
  }

  readFile(fileName) {
    return this.call('fileManager', 'readFile', fileName)
  }

  async resolveContractAndAddInstance(contractObject, address) {
    const data = await this.compilersArtefacts.getCompilerAbstract(contractObject.contract.file)

    this.compilersArtefacts.addResolvedContract(addressToString(address), data)
    this.addInstance(address, contractObject.abi, contractObject.name)
  }
}
