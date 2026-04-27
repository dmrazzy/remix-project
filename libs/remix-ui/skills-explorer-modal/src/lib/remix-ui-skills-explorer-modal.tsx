import React, { useState, useEffect, useRef } from 'react'
import './remix-ui-skills-explorer-modal.css'
import { endpointUrls } from '@remix-endpoints-helper'

export interface SkillInfo {
  id: string
  name: string
  description: string
}

export interface SkillData {
  id: string
  name: string
  description: string
  content: string
  resources: Record<string, string>
}

export interface RemixUiSkillsExplorerModalProps {
  isOpen: boolean
  onClose: () => void
  plugin?: any // Plugin instance to access fileManager
}

export function RemixUiSkillsExplorerModal(props: RemixUiSkillsExplorerModalProps) {
  const { isOpen, onClose, plugin } = props
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [wizardStep, setWizardStep] = useState<'skills' | 'confirm' | 'downloading'>('skills')
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState<boolean>(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchSkillsList = async (url: string): Promise<SkillInfo[]> => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    if (!Array.isArray(data.skills)) {
      throw new Error('Invalid skills list format - expected array of skills')
    }
    const skills: SkillInfo[] = []
    for (const skill of data.skills) {
      if (!skill.id || !skill.name) {
        console.warn(`[SkillsExplorer] Skipping invalid skill:`, skill)
        continue
      }
      const description = skill.description?.startsWith('>') ? skill.description.slice(1) : skill.description || ''
      skills.push({ id: skill.id, name: skill.name, description })
    }
    return skills
  }

  const fetchSkillData = async (url: string): Promise<SkillData> => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    if (!data.id || !data.name || !data.content || !data.resources) {
      throw new Error('Invalid skill data format - missing required fields')
    }
    return {
      id: data.id,
      name: data.name,
      description: data.description || '',
      content: data.content,
      resources: data.resources || {}
    }
  }

  const ensureDirectoryExists = async (dirPath: string) => {
    try {
      await plugin.call('fileManager', 'mkdir', dirPath)
    } catch (e) {
      // Directory may already exist
    }
  }

  useEffect(() => {
    if (isOpen) {
      setWizardStep('skills')
      setSelectedSkills(new Set())
      setSearchTerm('')
      setError(null)
      const load = async () => {
        setLoading(true)
        try {
          const url = endpointUrls.mcpCorsProxy + '/ethskills/skills'
          const list = await fetchSkillsList(url)
          setSkills(list)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load skills')
        } finally {
          setLoading(false)
        }
      }
      load()
    }
  }, [isOpen])

  const filteredSkills = skills.filter(skill =>
    skill.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    skill.description.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const toggleSkill = (id: string) => {
    setSelectedSkills(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleLoadSelected = () => {
    if (selectedSkills.size === 0) return
    setWizardStep('confirm')
  }

  const handleConfirmSkills = async () => {
    if (!plugin) {
      setError('Plugin not available')
      return
    }
    setWizardStep('downloading')
    setDownloading(true)
    const errors: string[] = []

    for (const skillId of selectedSkills) {
      try {
        const url = endpointUrls.mcpCorsProxy + `/ethskills/skills/${skillId}`
        const skillData = await fetchSkillData(url)
        const skillDir = `.skills/${skillId}`
        await ensureDirectoryExists(skillDir)
        await plugin.call('fileManager', 'writeFile', `${skillDir}/SKILL.md`, skillData.content)
        for (const [filename, content] of Object.entries(skillData.resources)) {
          await plugin.call('fileManager', 'writeFile', `${skillDir}/${filename}`, content)
        }
      } catch (err) {
        errors.push(`${skillId}: ${err instanceof Error ? err.message : 'Failed'}`)
      }
    }

    setDownloading(false)
    if (errors.length > 0) {
      setError(errors.join('\n'))
      setWizardStep('confirm')
    } else {
      onClose()
    }
  }

  const handleBack = () => {
    setWizardStep('skills')
    setError(null)
  }

  if (!isOpen) return null

  const selectedSkillInfos = skills.filter(s => selectedSkills.has(s.id))

  return (
    <section data-id="skills-explorer-modal-react" className="skills-explorer-modal-background" style={{ zIndex: 8888 }}>
      <div ref={containerRef} className="skills-explorer-modal-container border bg-dark p-2">

        {/* Header */}
        <div className="skills-explorer-modal-close-container bg-dark mb-3 w-100 d-flex flex-row justify-content-between align-items-center">
          {wizardStep === 'skills' ? (
            <div className="d-flex flex-row gap-2 w-100 mx-3 my-2">
              <input
                type="text"
                data-id="skills-explorer-search-input"
                placeholder="Search skills..."
                className="form-control skills-explorer-modal-search-input ps-5 fw-light"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          ) : (
            <div className="d-flex flex-row gap-2 w-100 mx-1 my-2">
              <button className="btn" onClick={handleBack} disabled={downloading}>
                <i className="fa-solid fa-arrow-left"></i>
              </button>
              {wizardStep === 'confirm' && (
                <span className="text-light align-self-center">
                  Add {selectedSkills.size} Skill{selectedSkills.size !== 1 ? 's' : ''}
                </span>
              )}
              {wizardStep === 'downloading' && (
                <span className="text-light align-self-center">Adding Skills...</span>
              )}
            </div>
          )}
          <button
            data-id="skills-explorer-modal-close-button"
            className="skills-explorer-modal-close-button"
            onClick={onClose}
            disabled={downloading}
          >
            <i className="fa-solid fa-xmark text-dark"></i>
          </button>
        </div>

        <div className="skills-explorer-container">

          {/* Step 1: Select skills */}
          {wizardStep === 'skills' && (
            <>
              {loading && (
                <div className="d-flex justify-content-center align-items-center py-5">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading skills...</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="alert alert-danger" role="alert">
                  <i className="fa-solid fa-exclamation-triangle me-2"></i>
                  {error}
                </div>
              )}

              {!loading && !error && (
                <>
                  <div className="category-title">Available Skills ({filteredSkills.length})</div>
                  <div className="category-description mb-4">
                    Select one or more Ethereum development skills to add to your workspace
                  </div>

                  {filteredSkills.length === 0 ? (
                    <div className="text-center py-5 text-muted">
                      <i className="fa-solid fa-search fa-3x mb-3"></i>
                      <div>No skills found matching your search</div>
                    </div>
                  ) : (
                    <div className="d-flex flex-wrap gap-3">
                      {filteredSkills.map((skill) => {
                        const isSelected = selectedSkills.has(skill.id)
                        return (
                          <div
                            key={skill.id}
                            className={`skill-card bg-light border p-3 ${isSelected ? 'border-primary' : ''}`}
                            style={isSelected ? { boxShadow: '0 0 0 2px var(--bs-primary)' } : {}}
                            onClick={() => toggleSkill(skill.id)}
                            data-id={`skill-card-${skill.id}`}
                          >
                            <div className="card-body">
                              <div className="d-flex justify-content-between align-items-start mb-2">
                                <h6 className="card-title text-dark mb-0">{skill.name}</h6>
                                {isSelected && (
                                  <i className="fa-solid fa-circle-check text-primary ms-2 flex-shrink-0"></i>
                                )}
                              </div>
                              <p className="card-description text-muted mb-0">
                                {skill.description || 'No description available'}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Step 2: Confirm */}
          {wizardStep === 'confirm' && (
            <div className="confirm-skill-step">
              <div className="d-flex flex-column align-items-center py-5">
                <i className="fa-solid fa-download fa-3x mb-4 text-primary"></i>
                <h3 className="mb-3">Add Skills to Workspace</h3>
                <div className="skill-details mb-4 text-center">
                  {selectedSkillInfos.map(s => (
                    <div key={s.id} className="mb-1">
                      <strong className="text-light">{s.name}</strong>
                      <span className="text-muted ms-2 small">→ .skills/{s.id}</span>
                    </div>
                  ))}
                </div>
                <div className="alert alert-info mb-4">
                  <i className="fa-solid fa-info-circle me-2"></i>
                  {selectedSkills.size === 1
                    ? `This will create files in the <code>.skills/${[...selectedSkills][0]}</code> directory.`
                    : `This will create files in <code>.skills/</code> for each selected skill.`}
                </div>
                {error && (
                  <div className="alert alert-danger mb-3" role="alert">
                    <i className="fa-solid fa-exclamation-triangle me-2"></i>
                    <pre className="mb-0 small">{error}</pre>
                  </div>
                )}
                <div className="d-flex gap-3">
                  <button className="btn btn-secondary" onClick={handleBack}>Cancel</button>
                  <button
                    data-id="skills-explorer-confirm-add"
                    className="btn btn-primary"
                    onClick={handleConfirmSkills}
                  >
                    Add Skill{selectedSkills.size !== 1 ? 's' : ''}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Downloading */}
          {wizardStep === 'downloading' && (
            <div className="downloading-skill-step">
              <div className="d-flex flex-column align-items-center py-5">
                <div className="spinner-border text-primary fa-3x mb-4" role="status">
                  <span className="visually-hidden">Downloading skills...</span>
                </div>
                <h3 className="text-light mb-3">Adding Skills</h3>
                <p className="text-muted">
                  Downloading and setting up {selectedSkills.size} skill{selectedSkills.size !== 1 ? 's' : ''}...
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Fixed footer - outside scrollable area */}
        {wizardStep === 'skills' && !loading && !error && selectedSkills.size > 0 && (
          <div className="skills-explorer-modal-footer">
            <button
              data-id="skills-explorer-load-selected"
              className="btn btn-primary"
              onClick={handleLoadSelected}
            >
              <i className="fa-solid fa-download me-2"></i>
              Load {selectedSkills.size} Selected Skill{selectedSkills.size !== 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
