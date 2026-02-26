import React from 'react'

interface AiChatButtonsProps {
  theme: string
  plugin?: any
  sendPrompt: (s: string) => void
  handleGenerateWorkspace: () => void
}

export function AiChatButtons({ theme, plugin, sendPrompt, handleGenerateWorkspace }: AiChatButtonsProps) {

  const statusCallback = (status: string): Promise<void> => {
    console.log('status', status)
    plugin.call('remixaiassistant', 'handleExternalMessage', status)
    return Promise.resolve()
  }

  const btnList: {
    label: string,
    icon: string,
    color: string,
    action: () => void
  }[] = [
    {
      label: 'File',
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} far fa-copy`,
      color: '',
      action: () => sendPrompt('Create a new file')
    },
    {
      label: 'New workspace',
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-plus`,
      color: '',
      action: handleGenerateWorkspace
    },
  ]

  return (
    <div className="d-flex flex-column mt-3" style={{ maxWidth: '400px' }}>
      <div className="d-flex flex-row gap-1 justify-content-center">
        {btnList.slice(0,3).map((starter, index) => (
          <button
            key={`${starter.label}-${index}`}
            data-id={`remix-ai-assistant-starter-${starter.label}-${index}`}
            className={`mb-2 border-0 rounded-4 text-nowrap gap-2 btn ${theme?.toLowerCase() === 'dark' ? 'btn-dark' : 'btn-light text-light-emphasis'} `}
            onClick={starter.action}
          >
            <i className={`${starter.icon} me-1`}></i>
            {starter.label}
          </button>
        ))}
      </div>
    </div>
  )
}
