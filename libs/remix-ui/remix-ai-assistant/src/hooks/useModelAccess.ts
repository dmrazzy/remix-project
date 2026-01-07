import { useState, useEffect } from 'react'
import { endpointUrls } from '@remix-endpoints-helper'
import { getDefaultModel, AVAILABLE_MODELS } from '@remix/remix-ai-core'

export interface ModelAccess {
  allowedModels: string[]
  isLoading: boolean
  error: string | null
  checkAccess: (modelId: string) => boolean
  refreshAccess: () => Promise<void>
}

export function useModelAccess(): ModelAccess {
  const [allowedModels, setAllowedModels] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchModelAccess = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const token = localStorage.getItem('remix_access_token')
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {}

      const response = await fetch(`${endpointUrls.sso}/accounts`, {
        credentials: 'include',
        headers
      })
      if (response.ok) {
        // allow users to have access to all models
        setAllowedModels(AVAILABLE_MODELS.map(m => m.id) || [])
      } else {
        // Fallback to default model only
        const defaultModel = getDefaultModel()
        setAllowedModels([defaultModel.id, 'ollama'])
      }
    } catch (err) {
      console.error('Failed to fetch model access:', err)
      const defaultModel = getDefaultModel()
      setAllowedModels([defaultModel.id, 'ollama'])
      setError('Failed to load model access')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchModelAccess()
  }, [])

  const checkAccess = (modelId: string) => {
    return allowedModels.includes(modelId)
  }

  return {
    allowedModels,
    isLoading,
    error,
    checkAccess,
    refreshAccess: fetchModelAccess
  }
}
