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

async function goToVMtraceStep (browser: NightwatchBrowser, step: number, _incr: number, done: VoidFunction) {
  const targetStep = step

  // Wait for the call trace header to be present and give time for any previous navigation to complete
  browser
    .waitForElementPresent('*[data-id="callTraceHeader"]')
    .pause(500) // Ensure header shows current step accurately

  // Try to use the debugger's jumpTo method directly for smooth navigation
  browser.execute(function (target) {
    // Find the debugger plugin and use jumpTo for instant, smooth navigation
    try {
      // Method 1: Check window.remixide (main method)
      if ((window as any).remixide) {
        const pluginManager = (window as any).remixide.appManager
        if (pluginManager) {
          const debuggerPlugin = pluginManager.getPlugin('debugger')
          if (debuggerPlugin && debuggerPlugin.currentDebugger && debuggerPlugin.currentDebugger.step_manager) {
            const stepManager = debuggerPlugin.currentDebugger.step_manager
            if (typeof stepManager.jumpTo === 'function') {
              stepManager.jumpTo(target)
              console.log('[goToVMTraceStep] Used jumpTo method to step', target)
              return { success: true, method: 'jumpTo', target }
            }
          }
        }
      }

      // Method 2: Try window.workspace
      if ((window as any).workspace && (window as any).workspace.getDebugger) {
        const debuggerInstance = (window as any).workspace.getDebugger()
        if (debuggerInstance && debuggerInstance.step_manager && typeof debuggerInstance.step_manager.jumpTo === 'function') {
          debuggerInstance.step_manager.jumpTo(target)
          console.log('[goToVMTraceStep] Used workspace debugger jumpTo to step', target)
          return { success: true, method: 'workspace.jumpTo', target }
        }
      }

      // Method 3: Search for React component state with debugger
      const searchForDebugger = (obj: any, depth = 0): any => {
        if (depth > 5) return null
        if (!obj || typeof obj !== 'object') return null

        // Look for debugger with step_manager
        if (obj.debugger && obj.debugger.step_manager && typeof obj.debugger.step_manager.jumpTo === 'function') {
          return obj.debugger.step_manager
        }

        // Look for step_manager directly
        if (obj.step_manager && typeof obj.step_manager.jumpTo === 'function') {
          return obj.step_manager
        }

        // Search in properties
        for (const key in obj) {
          if (key.startsWith('__react')) {
            const result = searchForDebugger(obj[key], depth + 1)
            if (result) return result
          }
        }
        return null
      }

      // Try to find debugger through DOM elements
      const debuggerPanel = document.querySelector('[data-id="sidePanelSwapitTitle"]')
      if (debuggerPanel) {
        const stepManager = searchForDebugger(debuggerPanel)
        if (stepManager) {
          stepManager.jumpTo(target)
          console.log('[goToVMTraceStep] Used DOM search jumpTo to step', target)
          return { success: true, method: 'dom.jumpTo', target }
        }
      }

      console.log('[goToVMTraceStep] jumpTo not found, will use button clicks')
      return { success: false, target }
    } catch (e) {
      console.error('[goToVMTraceStep] Error in jumpTo:', e)
      return { success: false, error: String(e), target }
    }
  }, [targetStep], (result) => {
    const executeResult = (result as any).value

    if (executeResult && executeResult.success) {
      // jumpTo was successful - just wait for UI to update
      console.log(`[goToVMTraceStep] jumpTo successful, waiting for UI update`)
      browser.pause(1000).perform(() => {
        done()
      })
    } else {
      // Fallback: Click buttons one at a time for smooth editor highlighting
      console.log(`[goToVMTraceStep] Using button click fallback`)

      browser.execute(function (target) {
        const headerText = document.querySelector('[data-id="callTraceHeader"]')?.textContent || ''
        const match = headerText.match(/Step:\s*(\d+)/)
        const currentStep = match ? parseInt(match[1]) : 0

        console.log(`[goToVMTraceStep] Current step from header: ${currentStep}, Target step: ${target}`)

        return {
          currentStep,
          target,
          stepsToGo: target - currentStep
        }
      }, [targetStep], (stepResult) => {
        const stepInfo = (stepResult as any).value
        const stepsToGo = stepInfo.stepsToGo

        console.log(`[goToVMTraceStep] Calculation: ${stepInfo.target} - ${stepInfo.currentStep} = ${stepsToGo} steps to go`)

        if (stepsToGo === 0) {
          console.log(`[goToVMTraceStep] Already at target step ${targetStep}`)
          done()
          return
        }

        const isForward = stepsToGo > 0
        const buttonSelector = isForward ? '[data-id="btnStepInto"]' : '[data-id="btnStepBack"]'
        const totalClicks = Math.abs(stepsToGo)

        console.log(`[goToVMTraceStep] Will click ${totalClicks} times ${isForward ? 'forward' : 'backward'} from step ${stepInfo.currentStep} to reach step ${stepInfo.target}`)

        // Click ONE at a time with a small pause to allow editor to highlight smoothly
        let clicksRemaining = totalClicks

        const clickOne = () => {
          if (clicksRemaining <= 0) {
            browser.pause(500).perform(() => done())
            return
          }

          browser
            .click(buttonSelector)
            .pause(50) // Small pause for smooth editor highlighting
            .perform(() => {
              clicksRemaining--
              clickOne()
            })
        }

        clickOne()
      })
    }
  })
}

module.exports = GoToVmTraceStep
