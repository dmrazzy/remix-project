import React from 'react'
import { AIModel } from '@remix/remix-ai-core'
import { ModelAccess } from '../hooks/useModelAccess'

interface ModelSelectorProps {
  models: AIModel[]
  selectedModelId: string
  modelAccess: ModelAccess
  onSelect: (modelId: string) => void
  onClose: () => void
  position: { top: number; left: number }
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  models,
  selectedModelId,
  modelAccess,
  onSelect,
  onClose,
  position
}) => {
  // Group models by category
  const groupedModels = models.reduce((acc, model) => {
    if (!acc[model.category]) acc[model.category] = []
    acc[model.category].push(model)
    return acc
  }, {} as Record<string, AIModel[]>)

  return (
    <div
      className="position-absolute bg-light border border-text rounded shadow"
      style={{
        top: position.top,
        left: position.left,
        minWidth: '300px',
        maxHeight: '400px',
        overflowY: 'auto',
        zIndex: 1000
      }}
    >
      <div className="p-2">
        {Object.entries(groupedModels).map(([category, categoryModels]) => (
          <div key={category} className="mb-2">
            <div className="text-uppercase small text-secondary px-2 py-1">
              {category}
            </div>
            {categoryModels.map(model => {
              const hasAccess = modelAccess.checkAccess(model.id)
              const isSelected = model.id === selectedModelId

              return (
                <div
                  key={model.id}
                  className={`d-flex align-items-center p-2 ${
                    hasAccess ? 'cursor-pointer hover-bg-secondary' : 'opacity-50'
                  } ${isSelected ? 'bg-secondary' : ''}`}
                  onClick={() => hasAccess && onSelect(model.id)}
                  style={{ cursor: hasAccess ? 'pointer' : 'not-allowed' }}
                >
                  <div className="flex-grow-1">
                    <div className="d-flex align-items-center">
                      <span className="fw-bold">{model.name}</span>
                      {!hasAccess && (
                        <i className="fa fa-lock ms-2 text-warning" />
                      )}
                      {isSelected && (
                        <i className="fa fa-check ms-2 text-success" />
                      )}
                    </div>
                    <div className="small text-secondary">
                      {model.description}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Upgrade prompt for locked models */}
      <div className="border-top p-2 text-center">
        <small className="text-secondary">
          <i className="fa fa-lock me-1" />
          Premium models require authentication
        </small>
      </div>
    </div>
  )
}
