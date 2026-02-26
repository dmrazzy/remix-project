import React, { useState, useEffect } from 'react'

interface AiChatButtonsProps {
  theme: string
  plugin?: any
  sendPrompt: (s: string) => void
  handleGenerateWorkspace: () => void
}

export function AiChatButtons({ theme, plugin, sendPrompt, handleGenerateWorkspace }: AiChatButtonsProps) {
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [latestCompiledContract, setLatestCompiledContract] = useState<string | null>(null)

  useEffect(() => {
    if (!plugin) return

    const updateState = async () => {
      try {
        const file = await plugin.call('fileManager', 'getCurrentFile')
        setCurrentFile(file)
      } catch (error) {
        setCurrentFile(null)
      }

      try {
        const compilationResult = await plugin.call('solidity', 'getCompilationResult')
        if (compilationResult && compilationResult.data && compilationResult.data.contracts) {
          const files = Object.keys(compilationResult.data.contracts)
          if (files.length > 0) {
            const firstFile = files[0]
            const contracts = Object.keys(compilationResult.data.contracts[firstFile] || {})
            if (contracts.length > 0) {
              setLatestCompiledContract(contracts[0])
            }
          }
        }
      } catch (error) {
      }
    }

    updateState()
    const interval = setInterval(updateState, 2000)
    return () => {
      clearInterval(interval)
    }
  }, [plugin])

  const handleReviewFile = () => {
    if (currentFile) {
      const fileName = currentFile.split('/').pop() || currentFile
      sendPrompt(`Review the file ${fileName}`)
    }
  }

  const handleDeployContract = () => {
    if (latestCompiledContract) {
      sendPrompt(`Deploy the ${latestCompiledContract} contract`)
    }
  }

  const handleCreateERC20 = () => {
    sendPrompt('Create an ERC20 token contract')
  }

  const dynamicButtons: {
    label: string,
    icon: string,
    color: string,
    action: () => void
  }[] = []

  if (currentFile) {
    const fileName = currentFile.split('/').pop() || currentFile
    dynamicButtons.push({
      label: `Review ${fileName}`,
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-search`,
      color: '',
      action: handleReviewFile
    })
  }

  if (latestCompiledContract) {
    dynamicButtons.push({
      label: `Deploy ${latestCompiledContract}`,
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-rocket`,
      color: '',
      action: handleDeployContract
    })
  }

  const btnList: {
    label: string,
    icon: string,
    color: string,
    action: () => void
  }[] = [
    {
      label: 'New workspace',
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-plus`,
      color: '',
      action: handleGenerateWorkspace
    },
    ...dynamicButtons
  ]

  return (
    <div className="d-flex flex-wrap gap-2 mt-3 justify-content-center" style={{ maxWidth: '100%' }}>
      {btnList.map((starter, index) => (
        <button
          key={`${starter.label}-${index}`}
          data-id={`remix-ai-assistant-starter-${starter.label}-${index}`}
          className={`mb-2 border-0 rounded-4 text-nowrap gap-2 btn ${theme?.toLowerCase() === 'dark' ? 'btn-dark' : 'btn-light text-light-emphasis'}`}
          onClick={starter.action}
        >
          <i className={`${starter.icon} me-1`}></i>
          {starter.label}
        </button>
      ))}
    </div>
  )
}
