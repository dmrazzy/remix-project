import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class SelectContract extends EventEmitter {
  command(this: NightwatchBrowser, contractName: string): NightwatchBrowser {
    this.api
      .useCss()
      // Click the contract dropdown toggle to open the menu
      .waitForElementVisible('[data-id="contractDropdownToggle"]', 10000)
      .click('[data-id="contractDropdownToggle"]')
      // Wait for dropdown menu to be visible
      .waitForElementVisible('[data-id="contractDropdownMenu"]', 10000)
      // Wait for the specific contract item and click it
      .waitForElementPresent(`[data-id="contractDropdownItem-${contractName}"]`, 10000)
      .click(`[data-id="contractDropdownItem-${contractName}"]`)
      .perform(() => this.emit('complete'))
    return this
  }
}

module.exports = SelectContract
