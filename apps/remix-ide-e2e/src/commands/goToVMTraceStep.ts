import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'
class GoToVmTraceStep extends EventEmitter {
  command (this: NightwatchBrowser, step: number, incr?: number): NightwatchBrowser {
    goToVMtraceStep(this.api, step, incr, () => {
      this.emit('complete')
    })
    return this
  }
}

function goToVMtraceStep (browser: NightwatchBrowser, step: number, incr: number, done: VoidFunction) {
  // New debugger uses bottom bar navigation buttons, simulate clicking step buttons to reach target step
  browser.waitForElementPresent('*[data-id="callTraceHeader"]')
    .execute(function (targetStep) {
      // Use step buttons repeatedly to reach target step
      // Access the step manager through the bottom bar buttons' event handlers
      const stepIntoBtn = document.querySelector('[data-id="btnStepInto"]') as HTMLButtonElement
      const stepBackBtn = document.querySelector('[data-id="btnStepBack"]') as HTMLButtonElement

      // Get current step from the header
      const headerText = document.querySelector('[data-id="callTraceHeader"]')?.textContent || ''
      const match = headerText.match(/Step:\s*(\d+)/)
      const currentStep = match ? parseInt(match[1]) : 0

      if (currentStep < targetStep) {
        // Step forward
        for (let i = currentStep; i < targetStep; i++) {
          if (stepIntoBtn) stepIntoBtn.click()
        }
      } else if (currentStep > targetStep) {
        // Step backward
        for (let i = currentStep; i > targetStep; i--) {
          if (stepBackBtn) stepBackBtn.click()
        }
      }

      return { currentStep, targetStep }
    }, [step])
    .pause(1000) // Wait for step changes to propagate
    .perform(() => {
      done()
    })
}

module.exports = GoToVmTraceStep
