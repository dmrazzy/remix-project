/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React from 'react'
import { AppAction } from '@remix-ui/app'
import { PluginViewWrapper } from '@remix-ui/helper'
import { Plugin } from '@remixproject/engine'
import { EventEmitter } from 'events'
import * as packageJson from '../../../../../package.json'
import { RemixUiSkillsExplorerModal } from 'libs/remix-ui/skills-explorer-modal/src/lib/remix-ui-skills-explorer-modal'

const pluginProfile = {
  name: 'skillsexplorermodal',
  displayName: 'Skills Explorer Modal',
  description: 'Skills Explorer Modal',
  methods: [],
  events: [],
  maintainedBy: 'Remix',
  kind: 'skillsexplorermodal',
  location: 'none',
  version: packageJson.version,
  permission: true,
  documentation: ''
}

export class SkillsExplorerModalPlugin extends Plugin {
  element: HTMLDivElement
  dispatch: React.Dispatch<any> = () => { }
  event: EventEmitter
  appStateDispatch: React.Dispatch<AppAction>

  constructor() {
    super(pluginProfile)
    this.element = document.createElement('div')
    this.element.setAttribute('id', 'skills-explorer-modal')
    this.dispatch = () => { }
    this.event = new EventEmitter()
  }

  async onActivation(): Promise<void> { }

  onDeactivation(): void { }

  setDispatch(dispatch: React.Dispatch<any>) {
    this.dispatch = dispatch
    this.renderComponent()
  }

  setAppStateDispatch(appStateDispatch: React.Dispatch<AppAction>) {
    this.appStateDispatch = appStateDispatch
  }

  render() {
    return (
      <div id="inner-remix-skills-explorer-modal">
        <PluginViewWrapper plugin={this} useAppContext={true} />
      </div>
    )
  }

  renderComponent() {
    this.dispatch({ ...this })
  }

  updateComponent(state: any) {
    return (
      <RemixUiSkillsExplorerModal
        isOpen={true}
        onClose={() => {
          if (this.appStateDispatch) {
            this.appStateDispatch({ type: 'SHOW_SKILLS_MODAL' as any, payload: false })
          }
        }}
        plugin={this}
      />
    )
  }
}
