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
  onSkillSelect?: (skill: SkillInfo) => void
  plugin?: any // Plugin instance to access fileManager and modal
}

export function RemixUiSkillsExplorerModal(props: RemixUiSkillsExplorerModalProps) {
  const { isOpen, onClose, onSkillSelect, plugin } = props
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [wizardStep, setWizardStep] = useState<'skills' | 'confirm' | 'downloading'>('skills')
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null)
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
        console.warn(`[SkillsExplorer] Skipping invalid skill object:`, skill)
        continue
      }
      const description = skill.description?.startsWith('>') ? skill.description.slice(1) : skill.description || ''
      skills.push({
        id: skill.id,
        name: skill.name,
        description: description
      })
    }

    return skills
  }

  const fetchSkillData = async (url: string): Promise<SkillData> => {
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    
    // Validate response structure
    if (!data.id || !data.name || !data.content || !data.resources) {
      throw new Error('Invalid skill data format - missing required fields (id, name, content, resources)')
    }

    return {
      id: data.id,
      name: data.name,
      description: data.description || '',
      content: data.content,
      resources: data.resources || {}
    }
  }

  const ensureDirectoryExists = async (dirPath: string, plugin: any) => {
    try {
      await plugin.call('fileManager', 'mkdir', dirPath)
    } catch (error) {
      // Directory might already exist, which is fine
      console.log(`Directory ${dirPath} already exists or could not be created:`, error)
    }
  }



  useEffect(() => {
    if (isOpen) {
      const loadSkills = async () => {
        setLoading(true)
        setError(null)
        try {
          const skillsUrl = 'http://localhost:9005/skills' // endpointUrls.mcpCorsProxy + '/ethskills/skills'
          const skillsList = await fetchSkillsList(skillsUrl)
          setSkills(skillsList)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load skills')
        } finally {
          setLoading(false)
        }
      }
      loadSkills()
    }
  }, [isOpen])

  const filteredSkills = skills.filter(skill =>
    skill.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    skill.description.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleSkillClick = (skill: SkillInfo) => {
    setSelectedSkill(skill)
    setWizardStep('confirm')
  }

  const handleConfirmSkill = async () => {
    if (!selectedSkill || !plugin) {
      setError('Plugin not available or no skill selected')
      return
    }

    setWizardStep('downloading')
    setDownloading(true)
    
    try {
      // Fetch skill data from remote endpoint
      const skillUrl = 'http://localhost:9005/skills/' + selectedSkill.id
      const skillData = await fetchSkillData(skillUrl)

      // Create skill directory
      const skillDir = `.skills/${selectedSkill.id}`
      await ensureDirectoryExists(skillDir, plugin)

      // Write SKILL.md file
      const skillFilePath = `${skillDir}/SKILL.md`
      await plugin.call('fileManager', 'writeFile', skillFilePath, skillData.content)

      // Write resource files
      for (const [filename, content] of Object.entries(skillData.resources)) {
        const filePath = `${skillDir}/${filename}`
        await plugin.call('fileManager', 'writeFile', filePath, content)
      }

      // Call the original onSkillSelect callback if provided
      onSkillSelect?.(selectedSkill)
      
      // Close the modal
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download skill')
      setWizardStep('confirm') // Go back to confirm step on error
    } finally {
      setDownloading(false)
    }
  }

  const handleCancelSkill = () => {
    setSelectedSkill(null)
    setWizardStep('skills')
  }

  if (!isOpen) return null

  return (
    <section data-id="skills-explorer-modal-react" className="skills-explorer-modal-background" style={{ zIndex: 8888 }}>
      <div ref={containerRef} className="skills-explorer-modal-container border bg-dark p-2">
        <div className="skills-explorer-modal-close-container bg-dark mb-3 w-100 d-flex flex-row justify-content-between align-items-center">
          {wizardStep === 'skills' ? <div className="d-flex flex-row gap-2 w-100 mx-3 my-2">
            <input
              type="text"
              name="skills-explorer-search"
              data-id="skills-explorer-search-input"
              placeholder="Search skills..."
              className="form-control skills-explorer-modal-search-input ps-5 fw-light"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div> : <div>
            <div className="d-flex flex-row gap-2 w-100 mx-1 my-2">
              <button className="btn" onClick={handleCancelSkill}>
                <i className="fa-solid fa-arrow-left"></i>
              </button>
              {wizardStep === 'confirm' && selectedSkill && (
                <span className="text-light align-self-center">Add Skill: {selectedSkill.name}</span>
              )}
              {wizardStep === 'downloading' && (
                <span className="text-light align-self-center">Adding Skill...</span>
              )}
            </div>
          </div>}
          <button 
            data-id="skills-explorer-modal-close-button" 
            className="skills-explorer-modal-close-button" 
            onClick={onClose}
          >
            <i className="fa-solid fa-xmark text-dark"></i>
          </button>
        </div>

        <div className="skills-explorer-container">
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
                    Browse and select from available Ethereum development skills
                  </div>

                  {filteredSkills.length === 0 ? (
                    <div className="text-center py-5 text-muted">
                      <i className="fa-solid fa-search fa-3x mb-3"></i>
                      <div>No skills found matching your search</div>
                    </div>
                  ) : (
                    <div className="d-flex flex-wrap gap-3">
                      {filteredSkills.map((skill) => (
                        <div
                          key={skill.id}
                          className="skill-card bg-light border p-3"
                          onClick={() => handleSkillClick(skill)}
                        >
                          <div className="card-body">
                            <h6 className="card-title text-dark mb-2">{skill.name}</h6>
                            <p className="card-description text-muted mb-0">
                              {skill.description || 'No description available'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {wizardStep === 'confirm' && selectedSkill && (
            <div className="confirm-skill-step">
              <div className="d-flex flex-column align-items-center py-5">
                <i className="fa-solid fa-download fa-3x mb-4 text-primary"></i>
                <h3 className="mb-3">Add AI Skill to Workspace</h3>
                <div className="skill-details mb-4 text-center">
                  <h4 className="">{selectedSkill.name}</h4>
                  <p className="text-muted">{selectedSkill.description}</p>
                </div>
                <div className="alert alert-info mb-4">
                  <i className="fa-solid fa-info-circle me-2"></i>
                  This will create files in the <code>.skills/{selectedSkill.id}</code> directory.
                </div>
                <div className="d-flex gap-3">
                  <button 
                    className="btn btn-secondary" 
                    onClick={handleCancelSkill}
                    disabled={downloading}
                  >
                    Cancel
                  </button>
                  <button 
                    className="btn btn-primary" 
                    onClick={handleConfirmSkill}
                    disabled={downloading}
                  >
                    Add Skill
                  </button>
                </div>
              </div>
            </div>
          )}

          {wizardStep === 'downloading' && selectedSkill && (
            <div className="downloading-skill-step">
              <div className="d-flex flex-column align-items-center py-5">
                <div className="spinner-border text-primary fa-3x mb-4" role="status">
                  <span className="visually-hidden">Downloading skill...</span>
                </div>
                <h3 className="text-light mb-3">Adding Skill</h3>
                <p className="text-muted">Downloading and setting up "{selectedSkill.name}"...</p>
                
                {error && (
                  <div className="alert alert-danger mt-4" role="alert">
                    <i className="fa-solid fa-exclamation-triangle me-2"></i>
                    {error}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}