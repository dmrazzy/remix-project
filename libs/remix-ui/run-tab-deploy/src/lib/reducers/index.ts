import { Actions, DeployWidgetState } from '../types'

export const deployInitialState: DeployWidgetState = {
  contracts: {
    contractList: []
  }
}

export const deployReducer = (state = deployInitialState, action: Actions): DeployWidgetState => {
  switch (action.type) {

  case 'ADD_CONTRACT_FILE': {
    const contract = {
      name: '',
      filePath: action.payload,
      contractData: null,
      isCompiled: false,
      isCompiling: false
    }
    const contractList = state.contracts.contractList.find((contract) => contract.filePath === action.payload) ? state.contracts.contractList : [...state.contracts.contractList, contract]

    return {
      ...state,
      contracts: {
        ...state.contracts,
        contractList
      }
    }
  }

  case 'UPDATE_COMPILED_CONTRACT': {
    const contract = {
      name: action.payload.name,
      filePath: action.payload.filePath,
      contractData: action.payload.contractData,
      isCompiled: true,
      isCompiling: false
    }
    const existingContract = state.contracts.contractList.find((contract) => contract.name === action.payload.name && contract.filePath === action.payload.filePath)

    if (existingContract) {
      // existingContract.name = action.payload.name
      existingContract.contractData = action.payload.contractData
    } else {
      state.contracts.contractList.push(contract)
    }

    return {
      ...state,
      contracts: {
        ...state.contracts,
        contractList: state.contracts.contractList
      }
    }
  }

  case 'REMOVE_CONTRACT_FILE': {
    const contractList = state.contracts.contractList.filter((contract) => contract.filePath !== action.payload)
    return {
      ...state,
      contracts: { ...state.contracts, contractList }
    }
  }

  default:
    return state
  }
}

