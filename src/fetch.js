
import isNode from 'detect-node'

// Detects Cloudflare's "Just a moment..." interstitial / bot-check page.
// When Fimfiction is behind a challenge, the request resolves with a small
// HTML page rather than the expected content, which otherwise leads to
// confusing downstream errors.
function isCloudflareChallenge (text) {
  if (typeof text !== 'string') return false
  return /<title>Just a moment\.\.\.<\/title>/i.test(text) ||
    /cf-browser-verification|challenge-platform|cf_chl_opt|__cf_chl/i.test(text)
}

function checkResponse (url, status, text) {
  if (isCloudflareChallenge(text)) {
    throw new Error(
      'Fimfiction returned a Cloudflare browser-check for ' + url + '. ' +
      'This endpoint is being protected against automated access, so the story ' +
      'contents could not be downloaded. Try again later, or use the browser extension while logged in.'
    )
  }
  if (typeof status === 'number' && (status < 200 || status >= 400)) {
    throw new Error('Error fetching ' + url + ' (HTTP ' + status + ')')
  }
}

function fetchNode (url, responseType) {
  const fetch = require('node-fetch').default
  if (url.startsWith('/')) {
    url = 'https://www.fimfiction.net' + url
  }
  return fetch(url, {
    method: 'GET',
    mode: 'cors',
    credentials: 'include',
    cache: 'default',
    redirect: 'follow',
    headers: {
      cookie: 'view_mature=true',
      referer: 'https://www.fimfiction.net/',
      accept: 'Accept: text/*, image/png, image/jpeg' // Fix for not getting webp images from Fimfiction
    }
  }).then((response) => {
    if (responseType) {
      return response.buffer()
    } else {
      return response.text().then((text) => {
        checkResponse(url, response.status, text)
        return text
      })
    }
  })
}

export default function fetch (url, responseType) {
  if (url.startsWith('//')) {
    url = 'http:' + url
  }

  if (isNode) {
    return fetchNode(url, responseType)
  }
  if (url.startsWith('/')) {
    url = window.location.origin + url
  }
  return new Promise((resolve, reject) => {
    if (typeof window.fetch === 'function') {
      // Binary resources (cover image, embedded images, YouTube API, etc.) are
      // fetched from third-party origins by the privileged background page.
      // Those servers don't send CORS headers, so forcing mode: 'cors' with
      // credentialed requests makes the browser reject them with a
      // "NetworkError when attempting to fetch resource". The background page
      // has host permissions, so it can read these cross-origin responses as
      // long as we don't send credentials (which would trigger a credentialed
      // CORS preflight the third-party servers can't satisfy).
      const isBinary = responseType === 'blob' || responseType === 'arraybuffer'
      const fetchOptions = {
        method: 'GET',
        cache: 'default',
        headers: {
          accept: 'Accept: text/*, image/png, image/jpeg' // Fix for not getting webp images from Fimfiction
        },
        referrer: window.location.origin
      }
      if (isBinary) {
        fetchOptions.credentials = 'omit'
      } else {
        fetchOptions.mode = 'cors'
        fetchOptions.credentials = 'include'
      }
      window.fetch(url, fetchOptions).then((response) => {
        if (responseType === 'blob') {
          response.blob().then(resolve, reject)
        } else if (responseType === 'arraybuffer') {
          response.arrayBuffer().then(resolve, reject)
        } else {
          response.text().then((text) => {
            try {
              checkResponse(url, response.status, text)
            } catch (err) {
              reject(err)
              return
            }
            resolve(text)
          }, reject)
        }
      }).catch((err) => {
        reject(new Error('Error fetching ' + url + ' (' + err + ')'))
      })
    } else {
      const x = new XMLHttpRequest()
      x.withCredentials = true
      x.setRequestHeader('accept', 'text/*, image/png, image/jpeg') // Fix for not getting webp images from Fimfiction
      x.open('get', url, true)
      if (responseType) {
        x.responseType = responseType
      }
      x.onload = function () {
        if (!responseType) {
          try {
            checkResponse(url, x.status, x.response)
          } catch (err) {
            reject(err)
            return
          }
        }
        resolve(x.response)
      }
      x.onerror = function () {
        reject(new Error('Error fetching ' + url))
      }
      x.send()
    }
  })
}
