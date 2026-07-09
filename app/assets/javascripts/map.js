//
// Defra Interactive Map – water location markers
// https://github.com/DEFRA/interactive-map
//

window.GOVUKPrototypeKit.documentReady(() => {
  const dataElement = document.getElementById('wis-map-data')
  const mapContainerId = 'wis-map'

  if (!dataElement || typeof defra === 'undefined') {
    return
  }

  const mapData = JSON.parse(dataElement.textContent)
  const interactPlugin = defra.interactPlugin({
    interactionModes: ['selectMarker'],
    deselectOnClickOutside: true
  })

  const map = new defra.InteractiveMap(mapContainerId, {
    behaviour: 'hybrid',
    mapLabel: mapData.mapLabel,
    pageTitle: mapData.pageTitle,
    mapProvider: defra.maplibreProvider(),
    mapStyle: {
      url: 'https://tiles.openfreemap.org/styles/liberty',
      attribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
      backgroundColor: '#f5f5f0'
    },
    bounds: mapData.bounds,
    containerHeight: '480px',
    hybridWidth: 835,
    plugins: [interactPlugin]
  })

  function buildPanelHtml (location) {
    const provenanceLabel = location.isLiveData
      ? '<strong class="govuk-tag govuk-tag--blue wis-provenance-tag">Live data</strong>'
      : '<strong class="govuk-tag govuk-tag--grey wis-provenance-tag">Demonstration data</strong>'

    const warningsHtml = location.warnings.length
      ? `<ul class="govuk-list govuk-list--bullet govuk-!-margin-bottom-2">${location.warnings.map(w => `<li>${w}</li>`).join('')}</ul>`
      : '<p class="govuk-body-s">No active warnings</p>'

    return `
      <h2 class="govuk-heading-s govuk-!-margin-bottom-1">${location.name}</h2>
      <p class="govuk-body-s govuk-!-margin-bottom-2">${location.waterbodyTypeLabel}</p>
      <p class="govuk-!-margin-bottom-2">${provenanceLabel}</p>
      <p class="govuk-body"><strong>Status: ${location.statusLabel}</strong></p>
      <p class="govuk-body-s">${location.summary}</p>
      ${warningsHtml}
      <p class="govuk-body govuk-!-margin-bottom-0">
        <a class="govuk-link" href="${location.url}">View full location details</a>
      </p>
    `
  }

  function updatePanel (location) {
    const panelContent = document.getElementById('wis-map-panel-content')
    if (panelContent && location) {
      panelContent.innerHTML = buildPanelHtml(location)
    }
  }

  map.on('map:ready', () => {
    mapData.locations.forEach((location) => {
      map.addMarker(location.id, location.coords, {
        label: `${location.name} – ${location.statusLabel}`,
        backgroundColor: location.markerColor
      })
    })

    interactPlugin.enable()

    map.addPanel('location-summary', {
      focus: false,
      label: 'Location summary',
      html: '<div id="wis-map-panel-content"><p class="govuk-body">Select a marker to see location details.</p></div>',
      mobile: { slot: 'drawer', dismissible: true },
      tablet: { slot: 'left-top', dismissible: true, width: '320px' },
      desktop: { slot: 'left-top', dismissible: true, width: '320px' }
    })
  })

  map.on('interact:selectionchange', ({ selectedMarkers }) => {
    if (selectedMarkers.length > 0) {
      const location = mapData.locations.find((item) => item.id === selectedMarkers[0])
      updatePanel(location)
      map.showPanel('location-summary')
    } else {
      map.hidePanel('location-summary')
    }
  })

  map.on('app:panelclosed', ({ panelId }) => {
    if (panelId === 'location-summary') {
      interactPlugin.clear()
    }
  })
})
