//
// Map placeholder – structured for Defra Accessible Maps plugin replacement
// Future: import Defra Accessible Maps and initialise with location coordinates
//

window.GOVUKPrototypeKit.documentReady(() => {
  const mapContainer = document.getElementById('wis-map')
  if (!mapContainer) return

  const markers = mapContainer.querySelectorAll('[data-location-id]')

  markers.forEach(marker => {
    marker.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        marker.click()
      }
    })
  })

  // Placeholder for future map integration:
  // const locations = [...] // from data attribute or API
  // DefraAccessibleMap.init({ container: 'wis-map', locations })
})
