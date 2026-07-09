//
// For guidance on how to create routes see:
// https://prototype-kit.service.gov.uk/docs/create-routes
//

const govukPrototypeKit = require('govuk-prototype-kit')
const router = govukPrototypeKit.requests.setupRouter()

const waterService = require('./services/water-service')

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
    postcodeParam: encodeURIComponent(postcode || location.postcode),
    statusLabel: waterService.getStatusLabel(location.overallStatus),
    waterbodyTypeLabel: waterService.getWaterbodyTypeLabel(location.waterbodyType)
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

function buildMapTableRows (locations, postcode) {
  return locations.map(location => [
    { html: `<a class="govuk-link" href="/location/${location.id}?postcode=${encodeURIComponent(postcode)}">${location.name}</a>` },
    { text: location.waterbodyTypeLabel },
    { html: `<span class="wis-status-indicator wis-status-indicator--${location.overallStatus}" aria-hidden="true"></span> ${location.statusLabel}` },
    { text: location.recentSewageDischarge.occurred ? 'Yes' : 'No' },
    { text: location.algaeWarning.active ? 'Yes' : 'No' },
    { text: `${location.waterTemperature.value}°C` }
  ])
}

// Postcode search
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
    errors.push({ text: 'Enter a valid UK postcode, for example RG1 1AA', href: '#postcode' })
    return res.render('search', {
      postcode,
      errors,
      errorMessage: { text: 'Enter a valid UK postcode, for example RG1 1AA' }
    })
  }

  res.redirect(`/overview?postcode=${encodeURIComponent(waterService.normalisePostcode(postcode))}`)
})

// Local overview
router.get('/overview', (req, res) => {
  const postcode = req.query.postcode
  if (!postcode) {
    return res.redirect('/search')
  }

  const overview = waterService.getOverviewForPostcode(postcode)
  overview.nearbyLocations = overview.nearbyLocations.map(loc => enrichLocation(loc, overview.postcode))
  overview.rivers = overview.rivers.map(loc => enrichLocation(loc, overview.postcode))
  overview.lakes = overview.lakes.map(loc => enrichLocation(loc, overview.postcode))
  overview.reservoirs = overview.reservoirs.map(loc => enrichLocation(loc, overview.postcode))
  overview.bathingWaters = overview.bathingWaters.map(loc => enrichLocation(loc, overview.postcode))

  res.render('overview', { overview })
})

// Map and list
router.get('/map', (req, res) => {
  const postcode = req.query.postcode
  if (!postcode) {
    return res.redirect('/search')
  }

  const normalised = waterService.normalisePostcode(postcode)
  const locations = waterService.getLocationsByPostcode(normalised).map(loc => enrichLocation(loc, normalised))

  res.render('map', {
    postcode: normalised,
    locations,
    tableRows: buildMapTableRows(locations, normalised)
  })
})

// Location detail
router.get('/location/:id', (req, res) => {
  const location = waterService.getLocationById(req.params.id)
  if (!location) {
    return res.status(404).render('404')
  }

  const postcode = req.query.postcode ? waterService.normalisePostcode(req.query.postcode) : location.postcode
  const enriched = enrichLocation(location, postcode)
  const nearbyLocations = waterService.getLocationsByIds(location.nearbyLocationIds)
    .map(loc => enrichLocation(loc, postcode))

  const chemistryRows = Object.entries(location.waterChemistry).map(([key, reading]) => ({
    label: chemistryLabels[key] || key,
    value: reading.value,
    unit: reading.unit,
    status: reading.status
  }))

  res.render('location', {
    location: enriched,
    postcode,
    nearbyLocations,
    timelineEvents: buildTimelineEvents(location),
    chemistryRows
  })
})

// Ask a question
router.get('/ask', (req, res) => {
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

  const location = locationId ? enrichLocation(waterService.getLocationById(locationId), postcode) : null

  res.render('ask', {
    postcode,
    location,
    currentResponse,
    conversation,
    userQuery,
    allQuestions: waterService.getAllQuestions()
  })
})

// Understanding water quality
router.get('/understanding-water-quality', (req, res) => {
  res.render('understanding-water-quality', {
    postcode: req.query.postcode || ''
  })
})

module.exports = router
