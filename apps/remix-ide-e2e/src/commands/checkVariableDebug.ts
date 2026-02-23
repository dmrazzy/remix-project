import { NightwatchBrowser, NightwatchCheckVariableDebugValue } from 'nightwatch'
import EventEmitter from 'events'

const deepequal = require('deep-equal')

class CheckVariableDebug extends EventEmitter {
  command(this: NightwatchBrowser, id: string, debugValue: NightwatchCheckVariableDebugValue): NightwatchBrowser {
    this.api.perform((done) => {
      checkDebug(this.api, id, debugValue, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function checkDebug(browser: NightwatchBrowser, id: string, debugValue: NightwatchCheckVariableDebugValue, done: VoidFunction) {
  // id is soliditylocals or soliditystate
  // Map id to data-id attribute (capitalize first letter after 'solidity')
  const dataId = id === 'soliditylocals' ? 'solidityLocals' : id === 'soliditystate' ? 'solidityState' : id

  let resultOfElement = null
  let isEqual = false
  // waitUntil will run with intervals of 1000ms for 10 seconds until the condition is met
  browser.waitUntil(() => {
    browser.execute(function (dataId: string) {
      // Parse JSON from the new JSON renderer DOM structure
      const element = document.querySelector(`[data-id="${dataId}"]`) as HTMLElement
      if (!element) return null

      // Extract JSON by parsing the visible structure
      // The JSON renderer outputs key-value pairs in .json-key and .json-value elements
      const result: any = {}

      function parseElement(el: Element): any {
        const obj: any = {}
        const children = el.children

        for (let i = 0; i < children.length; i++) {
          const child = children[i]
          const keyEl = child.querySelector('.json-key')
          const valueEl = child.querySelector('.json-value')

          if (keyEl && valueEl) {
            const key = keyEl.textContent?.trim()
            const valueText = valueEl.textContent?.trim()
            if (key && valueText) {
              try {
                obj[key] = JSON.parse(valueText)
              } catch (e) {
                obj[key] = valueText
              }
            }
          }

          // Recursively parse nested structures
          const nestedKey = child.querySelector('.json-key')?.textContent?.trim()
          if (nestedKey && child.querySelector('.json-nested')) {
            obj[nestedKey] = parseElement(child)
          }
        }

        return Object.keys(obj).length > 0 ? obj : null
      }

      const parsed = parseElement(element)
      return parsed ? JSON.stringify(parsed) : null
    }, [dataId], (result) => {
      if (result.value) {
        try {
          resultOfElement = JSON.parse(<string>result.value)
          isEqual = deepequal(debugValue, resultOfElement)
        } catch (e) {
          browser.assert.fail('cant parse solidity state', e.message, '')
        }
      }
    })
    if (isEqual) return true
    return false
  }, 10000, 1000)
    .perform(() => {
      if (!isEqual) {
        browser.assert.fail(JSON.stringify(resultOfElement), 'info about error\n ' + JSON.stringify(debugValue) + '\n ' + JSON.stringify(resultOfElement), '')
      }
      done()
    })
}

module.exports = CheckVariableDebug
