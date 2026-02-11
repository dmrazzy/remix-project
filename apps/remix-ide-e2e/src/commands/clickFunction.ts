import {
  NightwatchBrowser,
  NightwatchClickFunctionExpectedInput
} from 'nightwatch'
import EventEmitter from 'events'

class ClickFunction extends EventEmitter {
  command(
    this: NightwatchBrowser,
    instanceIndex: number,
    functionIndex: number,
    expectedInput?: NightwatchClickFunctionExpectedInput
  ): NightwatchBrowser {
    this.api
      .waitForElementPresent(`[data-id="deployedContractItem-${instanceIndex}-input-${functionIndex}"]`)
      .perform(function (client, done) {
        client.execute(
          function () {
            document.querySelector('#runTabView').scrollTop =
              document.querySelector('#runTabView').scrollHeight
          },
          [],
          function () {
            if (expectedInput) {
              client.setValue(
                `[data-id="deployedContractItem-${instanceIndex}-input-${functionIndex}"]`,
                expectedInput.values,
                (_) => _
              )
            }
            done()
          }
        )
      })
      .click(`[data-id="deployedContractItem-${instanceIndex}-button-${functionIndex}"]`)
      .pause(2000)
      .perform(() => {
        this.emit('complete')
      })
    return this
  }
}

module.exports = ClickFunction
