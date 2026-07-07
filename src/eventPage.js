/* global chrome, safari */

import fetch from './fetch'

if (typeof safari !== 'undefined') {
  safari.application.addEventListener('message', function (ev) {
    const url = ev.message
    console.log('Fetching', url)
    fetch(url, 'arraybuffer').then((buffer) => {
      console.log('Fetched ' + url)
      ev.target.page.dispatchMessage('remote', {
        input: url,
        output: buffer
      })
    })
  }, false)
} else {
  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (typeof request === 'string') {
      console.log('Fetching', request)
      // Fetch in the privileged background page and send the raw bytes back to
      // the content script. Previously this passed a blob: object URL back, but
      // blob URLs are scoped to the background page's moz-extension:// origin
      // and can't be fetched from the content script's page context (that fails
      // with "NetworkError when attempting to fetch resource").
      fetch(request, 'arraybuffer').then((buffer) => {
        console.log('Fetched', request)
        sendResponse({ ok: true, data: Array.from(new Uint8Array(buffer)) })
      }).catch((err) => {
        console.error('Error fetching', request, err)
        // Respond so the content script's promise resolves instead of hanging.
        sendResponse({ ok: false })
      })
      // required for async
      return true
    } else if (request.showPageAction) {
      chrome.pageAction.show(sender.tab.id)
    }
  })

  chrome.pageAction.onClicked.addListener(function (tab) {
    chrome.tabs.sendMessage(tab.id, 'pageAction')
  })
}
