'use strict'

import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'
const regExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080', true)
  },

  // ==================== GROUP 1: Basic Conversation Operations ====================

  'Should open chat history sidebar #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      // .waitForElementVisible('*[data-id="assistant-selector-btn"]')
      // .click('*[data-id="assistant-selector-btn"]')
      // .waitForElementVisible('*[data-id="composer-ai-assistant-openai"]')
      // .click('*[data-id="composer-ai-assistant-openai"]', function () {
      //   browser
      //     .waitForElementVisible('*[data-id="ai-response-chat-bubble-section"]')
      //     .assert.textContains('#remix-ai-chat-history > div.d-flex.flex-column.overflow-y-auto.border-box-sizing.preserve-wrap.overflow-x-hidden > div:nth-child(2) > div > div.chat-bubble.p-2.rounded.bubble-assistant.bg-light > div > p', 'AI Provider set')
      // })
      .waitForElementVisible('*[data-id="toggle-history-btn"]')
      .click('*[data-id="toggle-history-btn"]')
      .assert.containsText('*[data-id="chat-history-sidebar-title"]', 'Chat history')
      .assert.containsText('*[data-id="conversation-item-title"]', 'New Conversation')
  },

  'Should create a new conversation #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="chat-history-back-btn"]')
      .click('*[data-id="chat-history-back-btn"]')
      .pause(1000)
      // .click('*[data-id="new-chat-btn new-conversation-btn"]')
      .waitForElementVisible('*[data-id="remix-ai-prompt-input"]')
      .setValue('*[data-id="remix-ai-prompt-input"]', 'Hello, this is my first message')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .waitForElementVisible('*[data-id="ai-user-chat-bubble"]')
      .assert.containsText('*[data-id="ai-user-chat-bubble"]', 'Hello, this is my first message')
  },

  'Should display conversation metadata #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="toggle-history-btn"]')
      .pause(3000)
      .execute(function () {
        const conversationItem = document.querySelector('[data-id^="conversation-item-"]')
        return conversationItem ? conversationItem.getAttribute('data-id') : null
      }, [], function (result) {
        const conversationId = result.value ? (result.value as string).replace('conversation-item-', '') : ''
        console.log('Testing conversation metadata for conversation ID:', conversationId)
        browser
          .waitForElementVisible(`*[data-id="conversation-item-${conversationId}"]`, 5000)
          .assert.textContains(`*[data-id="conversation-item-${conversationId}"] .conversation-meta`, 'message')
          .assert.containsText(`*[data-id="conversation-item-${conversationId}"] .conversation-meta`, 'Just now')
      })
  },

  'Should send multiple messages in a conversation #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="chat-history-back-btn"]')
      .click('*[data-id="chat-history-back-btn"]')
      .waitForElementVisible('*[data-id="assistant-selector-btn"]')
      .waitForElementVisible('*[data-id="remix-ai-prompt-input"]')
      .clearValue('*[data-id="remix-ai-prompt-input"]')
      .setValue('*[data-id="remix-ai-prompt-input"]', 'Second message')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .pause(500)
      .clearValue('*[data-id="remix-ai-prompt-input"]')
      .setValue('*[data-id="remix-ai-prompt-input"]', 'Third message')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .pause(1000)
      .waitForElementVisible('*[data-id="new-chat-btn new-conversation-btn"]')
      .click('*[data-id="new-chat-btn new-conversation-btn"]')
      .waitForElementVisible('*[data-id="toggle-history-btn"]')
      .pause(1000)
      .click('*[data-id="toggle-history-btn"]')
      .execute(function () {
        const conversationItem = document.querySelector('[data-id^="conversation-item-"]')
        return conversationItem ? conversationItem.getAttribute('data-id') : null
      }, [], function (result) {
        console.log('Testing conversation metadata after sending multiple messages:', result.value)
        const conversationId = result.value ? (result.value as string).replace('conversation-item-', '') : ''
        browser
          .pause(500)
          .waitForElementVisible(`*[data-id="conversation-item-${conversationId}"]`)
          .assert.textContains(`*[data-id="conversation-item-${conversationId}"] .conversation-meta`, '6 messages')
          .assert.containsText(`*[data-id="conversation-item-${conversationId}"] .conversation-meta`, 'Just now')
      })
  },

  'Should switch between conversations #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="chat-history-back-btn"]')
      .click('*[data-id="chat-history-back-btn"]')
      .waitForElementVisible('*[data-id="new-chat-btn new-conversation-btn"]')
      .click('*[data-id="new-chat-btn new-conversation-btn"]')
      .pause(1000)
      .clearValue('*[data-id="remix-ai-prompt-input"]')
      .setValue('*[data-id="remix-ai-prompt-input"]', 'This is a different conversation')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .click('*[data-id="new-chat-btn new-conversation-btn"]')
      .click('*[data-id="toggle-history-btn"]')
      .pause(1000)
      // Get conversation IDs
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        return Array.from(items).map(item => item.getAttribute('data-id')?.replace('conversation-item-', ''))
      }, [], function (result) {
        const ids = result.value as string[]
        const validIds = ids.filter(x => regExp.test(x))

        browser
          .click(`*[data-id="conversation-item-${validIds[0]}"]`)
          .pause(1000)
          .waitForElementVisible('*[data-id="ai-response-chat-bubble-section"]')
          .assert.textContains('*[data-id="ai-user-chat-bubble"]', 'This is a different conversation')
          .click('*[data-id="toggle-history-btn"]')
          .pause(500)
          .click(`*[data-id="conversation-item-${validIds[1]}"]`)
          .pause(1000)
          .waitForElementVisible('*[data-id="ai-response-chat-bubble-section"]')
          .pause(500)
          .assert.textContains('*[data-id="ai-user-chat-bubble"]', 'Hello, this is my first message')
      })
  },

  'Should archive a conversation #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="archive-chat-btn"]')
      .click('*[data-id="archive-chat-btn"]')
      .waitForElementVisible(`*[data-id="toggle-history-btn"]`)
      .click(`*[data-id="toggle-history-btn"]`)
      .waitForElementVisible('*[data-id="toggle-archived-btn"]', 5000)
      .assert.textContains('*[data-id="toggle-archived-btn"]', 'Archived (1)')
  },

  'Should unarchive a conversation #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="toggle-archived-btn"]')
      .pause(500)
      .waitForElementVisible('*[data-id="conversation-item-title"]', 500)
      .click('*[data-id="conversation-item-title"]')
      .waitForElementVisible('*[data-id="ai-response-chat-bubble-section"]')
      .pause(500)
      .assert.textContains('*[data-id="ai-user-chat-bubble"]', 'Hello, this is my first message')
  },

  'Should delete a conversation #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="new-chat-btn new-conversation-btn"]')
      .waitForElementVisible('*[data-id="remix-ai-prompt-input"]')
      .setValue('*[data-id="remix-ai-prompt-input"]', 'Conversation to be deleted')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .pause(500)
      .click('*[data-id="toggle-history-btn"]')
      .click('*[data-id="toggle-archived-btn"]')
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        return items.length > 0 ? items[0].getAttribute('data-id')?.replace('conversation-item-', '') : null
      }, [], function (result) {
        const conversationId = result.value as string

        browser
          .moveToElement(`*[data-id="conversation-item-${conversationId}"]`, 30, 20)
          .waitForElementVisible(`*[data-id="conversation-menu-${conversationId}"]`, 5000)
          .click(`*[data-id="conversation-menu-${conversationId}"]`)
          .pause(300)
          .waitForElementVisible('.conversation-menu', 5000)
          .click('.conversation-menu .conversation-menu-item:last-child')
          .pause(500)
          .acceptAlert()
          .pause(1000)
          .waitForElementNotPresent(`*[data-id="conversation-item-${conversationId}"]`, 5000)
      })
  },

  'Should persist conversations after page refresh #group1': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        return Array.from(items).map(item => item.getAttribute('data-id')?.replace('conversation-item-', ''))
      }, [], function (result) {
        const conversationIds = (result.value as string[]).filter(x => regExp.test(x))

        browser
          .click(`*[data-id="conversation-item-${conversationIds[0]}"]`)
      })
      .refreshPage()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .waitForElementVisible('*[data-id="toggle-history-btn"]')
      .click('*[data-id="toggle-history-btn"]')
      .pause(1000)
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        return items.length
      }, [], function (result) {
        browser
          .assert.equal(result.value, 9, 'All 9 conversations persisted after refresh')
      })
  },
  'Should search conversations by title, clear search and show all conversations #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="search-conversations-input"]')
      .setValue('*[data-id="search-conversations-input"]', 'New Conversation')
      .waitForElementVisible('*[data-id="conversation-item-title"]')
      .assert.textContains('*[data-id="conversation-item-title"]', 'New Conversation')
      .assert.not.textContains('*[data-id="conversation-item-title"]', 'This is a different conversation')
      .clearValue('*[data-id="search-conversations-input"]')
      .pause(500)
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        return items.length
      }, [], function (result) {
        browser
          .assert.equal(result.value, 3, 'All 3 conversations shown after clearing search')
      })
      .click('*[data-id="chat-history-back-btn"]')
  },
  'Should show floating chat history when maximized #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="maximizeRightSidePanel"]')
      .click('*[data-id="maximizeRightSidePanel"]')
      .pause(500)
      .waitForElementVisible('*[data-id="chat-history-sidebar-maximized"]', 500)
      .assert.visible('*[data-id="floating-chat-heading"]')
      .assert.containsText('*[data-id="floating-chat-heading"]', 'Chat history')
  }
}
