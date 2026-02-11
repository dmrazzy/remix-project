import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class ClearDeployedContract extends EventEmitter {
  command (this: NightwatchBrowser, index: number): NightwatchBrowser {
    this.api.perform((done: VoidFunction) => {
      clearContract(this.api, index, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function clearContract (browser: NightwatchBrowser, index: number, callback: VoidFunction) {
  browser
    .clickLaunchIcon('udapp')
    .waitForElementVisible(`[data-id="contractKebabIcon-${index}"]`)
    .click(`[data-id="contractKebabIcon-${index}"]`) // Click kebab icon
    .waitForElementVisible('[data-id="clear"]')
    .click('[data-id="clear"]') // Click "Clear" option in kebab menu
    .pause(500)
    .perform(() => {
      callback()
    })
}

module.exports = ClearDeployedContract
