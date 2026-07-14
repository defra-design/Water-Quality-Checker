//
// For guidance on how to create routes see:
// https://prototype-kit.service.gov.uk/docs/create-routes
//

const govukPrototypeKit = require('govuk-prototype-kit')
const router = govukPrototypeKit.requests.setupRouter()

const waterService = require('./services/water-service')
const dataProvenance = require('./config/data-provenance')
const metOfficeClient = require('./services/clients/met-office-client')
const osMapsClient = require('./services/clients/os-maps-client')

const chemistryLabels = {
  eColi: 'E. coli',
  intestinalEnterococci: 'Intestinal enterococci',
  dissolvedOxygen: 'Dissolved oxygen',
  ph: 'pH',
  turbidity: 'Turbidity',
  nitrate: 'Nitrate',
  phosphate: 'Phosphate',
  ammonia: 'Ammonia',
  conductivity: 'Conductivity',
  chlorophyll: 'Chlorophyll'
}

function enrichLocation (location, postcode) {
  return {
    ...location,
    isLiveData: Boolean(location.isLiveData),
    postcodeParam: encodeURIComponent(postcode || location.postcode),
    statusLabel: waterService.getStatusLabel(location.overallStatus),
    waterbodyTypeLabel: waterService.getWaterbodyTypeLabel(location.waterbodyType),
    siteKindLabel: waterService.getSiteKindLabel(location.siteKind),
    limitedEvidence: Boolean(location.limitedEvidence)
  }
}

function buildTimelineEvents (location) {
  const events = []

  if (location.recentSewageDischarge.occurred) {
    events.push({
      date: waterService.formatRelativeTime(location.recentSewageDischarge.when),
      description: location.recentSewageDischarge.description,
      type: 'sewage',
      status: `Duration: ${location.recentSewageDischarge.duration}`
    })
  }

  location.pollutionIncidents.forEach(incident => {
    events.push({
      date: incident.date,
      description: `${incident.type}: ${incident.description}`,
      type: 'pollution',
      status: incident.status
    })
  })

  if (location.algaeWarning.active) {
    events.push({
      date: 'Current',
      description: location.algaeWarning.description,
      type: 'algae',
      status: location.algaeWarning.type
    })
  }

  if (location.isLiveData && location.waterChemistry?.eColi?.value != null) {
    events.unshift({
      date: waterService.formatDate(location.lastUpdated),
      description: `Latest EA sample: E. coli ${location.waterChemistry.eColi.value} cfu/100ml`,
      type: 'normal',
      status: location.bathingWaterWarning?.classification || null
    })
  }

  if (events.length === 0) {
    events.push({
      date: 'No recent events',
      description: 'No significant events reported in the last 72 hours.',
      type: 'normal',
      status: null
    })
  }

  return events
}

function getMarkerColor (status) {
  const colors = {
    good: '#00703c',
    caution: '#f47738',
    poor: '#d4351c',
    unknown: '#505a5f'
  }
  return colors[status] || '#1d70b8'
}

function buildMapConfig (locations, postcode, areaName) {
  const lngs = locations.map(l => l.coordinates.lng)
  const lats = locations.map(l => l.coordinates.lat)
  const padding = 0.06

  return {
    mapLabel: `Water locations near ${postcode}`,
    pageTitle: areaName,
    bounds: [
      Math.min(...lngs) - padding,
      Math.min(...lats) - padding,
      Math.max(...lngs) + padding,
      Math.max(...lats) + padding
    ],
    center: [
      lngs.reduce((a, b) => a + b, 0) / lngs.length,
      lats.reduce((a, b) => a + b, 0) / lats.length
    ],
    postcode,
    mapStyle: osMapsClient.getMapStyleConfig(),
    isOsMapsConnected: osMapsClient.isConfigured(),
    locations: locations.map(location => ({
      id: location.id,
      name: location.name,
      coords: [location.coordinates.lng, location.coordinates.lat],
      status: location.overallStatus,
      statusLabel: location.statusLabel,
      waterbodyTypeLabel: location.waterbodyTypeLabel,
      summary: location.confidenceSummary,
      url: `/location/${location.id}?postcode=${encodeURIComponent(postcode)}`,
      markerColor: getMarkerColor(location.overallStatus),
      warnings: [
        location.limitedEvidence ? 'Limited water quality evidence' : null,
        location.recentSewageDischarge.occurred ? 'Recent sewage discharge' : null,
        location.algaeWarning.active ? 'Algae alert' : null,
        location.healthWarning.active ? 'Health warning' : null,
        location.pollutionIncidents.length > 0 ? 'Pollution incident' : null
      ].filter(Boolean),
      isLiveData: Boolean(location.isLiveData),
      limitedEvidence: Boolean(location.limitedEvidence),
      dataProvenance: dataProvenance.getLocationProvenance(location)
    }))
  }
}

function buildMapTableRows (locations, postcode) {
  return locations.map(location => [
    { html: `<a class="govuk-link" href="/location/${location.id}?postcode=${encodeURIComponent(postcode)}">${location.name}</a>` },
    { text: location.waterbodyTypeLabel },
    { html: `<span class="wis-status-indicator wis-status-indicator--${location.overallStatus}" aria-hidden="true"></span> ${location.statusLabel}` },
    { text: location.recentSewageDischarge.occurred ? 'Yes' : 'No' },
    { text: location.algaeWarning.active ? 'Yes' : 'No' },
    { text: location.waterTemperature.value != null ? `${location.waterTemperature.value}°C` : 'n/a' }
  ])
}

// Postcode search
router.get('/map/os-style', (req, res) => {
  if (!osMapsClient.isConfigured()) {
    return res.status(404).json({ error: 'OS Maps API not configured' })
  }
  res.set('Cache-Control', 'private, no-store')
  res.json(osMapsClient.getMapLibreStyle())
})

router.get('/search', (req, res) => {
  res.render('search', { postcode: req.query.postcode || '' })
})

router.post('/search', (req, res) => {
  const postcode = req.body.postcode || ''
  const errors = []

  if (!postcode.trim()) {
    errors.push({ text: 'Enter a postcode', href: '#postcode' })
    return res.render('search', {
      postcode,
      errors,
      errorMessage: { text: 'Enter a postcode' }
    })
  }

  if (!waterService.isValidPostcode(postcode)) {
    errors.push({ text: 'Enter a valid UK postcode, for example YO11 1AA', href: '#postcode' })
    return res.render('search', {
      postcode,
      errors,
      errorMessage: { text: 'Enter a valid UK postcode, for example YO11 1AA' }
    })
  }

  res.redirect(`/overview?postcode=${encodeURIComponent(waterService.normalisePostcode(postcode))}`)
})

// Local overview
router.get('/overview', async (req, res, next) => {
  try {
    const postcode = req.query.postcode
    if (!postcode) {
      return res.redirect('/search')
    }

    const overview = await waterService.getOverviewForPostcode(postcode)
    overview.nearbyLocations = overview.nearbyLocations.map(loc => enrichLocation(loc, overview.postcode))
    overview.rivers = overview.rivers.map(loc => enrichLocation(loc, overview.postcode))
    overview.lakes = overview.lakes.map(loc => enrichLocation(loc, overview.postcode))
    overview.reservoirs = overview.reservoirs.map(loc => enrichLocation(loc, overview.postcode))
    overview.bathingWaters = overview.bathingWaters.map(loc => enrichLocation(loc, overview.postcode))
    overview.recreationSites = (overview.recreationSites || []).map(loc => enrichLocation(loc, overview.postcode))
    overview.crtReservoirs = (overview.crtReservoirs || []).map(loc => enrichLocation(loc, overview.postcode))
    overview.hasDiscoverySites = overview.recreationSites.length > 0 || overview.crtReservoirs.length > 0
    overview.isMockData = dataProvenance.isOverviewDemo(overview)
    overview.factorProvenance = {
      rainfall: dataProvenance.getOverviewFactorProvenance(overview, 'rainfall'),
      sewage: dataProvenance.getOverviewFactorProvenance(overview, 'sewage'),
      pollution: dataProvenance.getOverviewFactorProvenance(overview, 'pollution'),
      algae: dataProvenance.getOverviewFactorProvenance(overview, 'algae')
    }

    res.render('overview', { overview })
  } catch (err) {
    next(err)
  }
})

// Map and list
router.get('/map', async (req, res, next) => {
  try {
    const postcode = req.query.postcode
    if (!postcode) {
      return res.redirect('/search')
    }

    const normalised = waterService.normalisePostcode(postcode)
    const locations = (await waterService.getLocationsByPostcode(normalised)).map(loc => enrichLocation(loc, normalised))
    const area = await waterService.getAreaForPostcode(normalised)
    const isLiveData = locations.some(loc => loc.isLiveData)
    const isSewageLiveData = locations.some(loc => loc.recentSewageDischarge?.isLiveData)
    const isPollutionLiveData = locations.some(loc => loc.isPollutionLiveData)
    const hasDiscoverySites = locations.some(loc => loc.limitedEvidence)

    res.render('map', {
      postcode: normalised,
      locations,
      isLiveData,
      isSewageLiveData,
      isPollutionLiveData,
      hasDiscoverySites,
      isMockData: !isLiveData,
      isMetOfficeConnected: metOfficeClient.isConfigured(),
      isOsMapsConnected: osMapsClient.isConfigured(),
      mapStyle: osMapsClient.getMapStyleConfig(),
      tableRows: buildMapTableRows(locations, normalised),
      mapConfig: buildMapConfig(locations, normalised, area.area)
    })
  } catch (err) {
    next(err)
  }
})

// Location detail
router.get('/location/:id', async (req, res, next) => {
  try {
    const location = await waterService.getLocationById(req.params.id)
    if (!location) {
      return res.status(404).render('404')
    }

    const postcode = req.query.postcode ? waterService.normalisePostcode(req.query.postcode) : location.postcode
    const enriched = enrichLocation(location, postcode)
    const nearbyLocations = (await Promise.all(
      location.nearbyLocationIds.map(id => waterService.getLocationById(id))
    )).filter(Boolean).map(loc => enrichLocation(loc, postcode))

    const chemistryRows = Object.entries(location.waterChemistry).map(([key, reading]) => ({
      label: chemistryLabels[key] || key,
      value: reading.value,
      unit: reading.unit,
      status: reading.status,
      dataType: dataProvenance.getChemistryProvenance(location, key),
      sampleNote: reading.isLiveData && reading.sampledAt
        ? `${waterService.formatRelativeTime(reading.sampledAt)}${reading.stationName ? ` at ${reading.stationName}` : ''}`
        : null
    }))

    res.render('location', {
      location: enriched,
      postcode,
      nearbyLocations,
      timelineEvents: buildTimelineEvents(location),
      chemistryRows,
      rainfallProvenance: dataProvenance.getRainfallProvenance(location)
    })
  } catch (err) {
    next(err)
  }
})

// Ask a question
router.get('/ask', async (req, res, next) => {
  try {
  const postcode = req.query.postcode || ''
  const questionId = req.query.question
  const userQuery = req.query.q || ''
  const locationId = req.query.location

  let currentResponse = null
  const conversation = []

  if (questionId) {
    currentResponse = waterService.getQuestionById(questionId)
    if (currentResponse) {
      conversation.push({ text: currentResponse.question, isUser: true })
    }
  } else if (userQuery) {
    const matches = waterService.searchQuestions(userQuery)
    if (matches.length > 0) {
      currentResponse = matches[0]
      conversation.push({ text: userQuery, isUser: true })
    } else {
      currentResponse = {
        response: 'I do not have a specific answer for that question in this prototype. Try one of the suggested questions below, or visit the understanding water quality page for more information.',
        followUp: ['swim-today', 'e-coli', 'algae']
      }
      conversation.push({ text: userQuery, isUser: true })
    }
  }

  const location = locationId ? enrichLocation(await waterService.getLocationById(locationId), postcode) : null

  res.render('ask', {
    postcode,
    location,
    currentResponse,
    conversation,
    userQuery,
    allQuestions: waterService.getAllQuestions()
  })
  } catch (err) {
    next(err)
  }
})

// Understanding water quality
router.get('/understanding-water-quality', (req, res) => {
  res.render('understanding-water-quality', {
    postcode: req.query.postcode || ''
  })
})

module.exports = router
