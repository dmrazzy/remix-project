import React, { useEffect, useReducer, useState } from 'react'
import { TransactionsAppContext } from './contexts'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { TransactionsPlugin } from 'apps/remix-ide/src/app/udapp/udappTransactions'
import { transactionsReducer, transactionsInitialState } from './reducers'
import TransactionsPortraitView from './widgets/TransactionsPortraitView'
import "./css/transaction-recorder.css"

function TransactionsWidget({ plugin }: { plugin: TransactionsPlugin }) {
  const [widgetState, dispatch] = useReducer(transactionsReducer, transactionsInitialState)
  const [themeQuality, setThemeQuality] = useState<string>('dark')

  useEffect(() => {
  }, [widgetState])

  useEffect(() => {
    plugin.on('udappDeployedContracts', 'deployedInstanceUpdated', (deployments: any[]) => {
      dispatch({ type: 'SET_DEPLOYMENTS', payload: deployments })
    })

    return () => {
      plugin.off('udappDeployedContracts', 'deployedInstanceUpdated')
    }
  }, [plugin])

  return (
    <TransactionsAppContext.Provider value={{ widgetState, dispatch, plugin, themeQuality }}>
      <TransactionsPortraitView />
    </TransactionsAppContext.Provider>
  )
}

export default TransactionsWidget
