/* global chrome, safari */

import fetch from './fetch'
import isNode from 'detect-node'

const safariQueue = {}

// messaging with the safari extension global page
function safariHandler (ev) {
  const type = ev.message.type
  const url = ev.message.input
  const data = ev.message.output // arraybuffer
  if (!safariQueue[url]) {
    // console.error("Unable to get callback for " + url, JSON.stringify(safariQueue))
    return
  }
  const cb = safariQueue[url].cb
  const responseType = safariQueue[url].responseType
  console.log(url, cb, responseType, data)
  delete safariQueue[url]

  if (responseType === 'blob') {
    const blob = new Blob([data], { type: type })
    cb(blob, type)
  } else {
    if (!responseType) {
      const blob = new Blob([data], { type: type })
      const fr = new FileReader()
      fr.onloadend = function () {
        cb(fr.result, type)
      }
      fr.readAsText(blob)
    } else {
      cb(data, type)
    }
  }
}
if (typeof safari !== 'undefined') {
  safari.self.addEventListener('message', safariHandler, false)
}

function fetchBackground (url, responseType) {
  return new Promise((resolve, reject) => {
    if (typeof chrome !== 'undefined' && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(url, function (response) {
        if (!response || !response.ok) {
          resolve(null)
          return
        }
        const bytes = new Uint8Array(response.data)
        if (responseType === 'arraybuffer') {
          // Return the underlying ArrayBuffer
          resolve(bytes.buffer)
        } else if (responseType === 'blob') {
          resolve(new Blob([bytes]))
        } else {
          // Decode as text (e.g. YouTube API JSON)
          resolve(new TextDecoder('utf-8').decode(bytes))
        }
      })
    } else if (typeof safari !== 'undefined') {
      safariQueue[url] = { cb: resolve, responseType: responseType }
      safari.self.tab.dispatchMessage('remote', url)
    } else {
      resolve(null)
    }
  })
}

export default function fetchRemote (url, responseType) {
  if (url.startsWith('//')) {
    url = 'https:' + url
  }
  if (!isNode && document.location.protocol === 'https:') {
    if (url.startsWith('/')) {
      url = window.location.origin + url
    }
    return fetchBackground(url, responseType)
  }
  return fetch(url, responseType).then((data) => {
    if (!data) return fetchBackground(url, responseType)
    else return Promise.resolve(data)
  })
}
