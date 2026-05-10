// pwa-push.js — Web Push event handlers, imported into the workbox-
// generated service worker via vite-plugin-pwa's importScripts hook.
//
// We intentionally use payload-less ("tickle") notifications. The push
// event fires with no data; we display a generic Sunpath rewarm notice
// and route the user to the Pipeline (Triggers Inbox) on click.

self.addEventListener('push', function (event) {
  const title = 'Sunpath rewarm'
  const body = 'Doors to revisit today — open Pipeline'
  const options = {
    body: body,
    tag: 'sunpath-rewarm',
    renotify: false,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: '/#/pipeline' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (winClients) {
        for (var i = 0; i < winClients.length; i++) {
          var client = winClients[i]
          if ('focus' in client) {
            client.navigate(url)
            return client.focus()
          }
        }
        if (clients.openWindow) return clients.openWindow(url)
        return null
      }),
  )
})
