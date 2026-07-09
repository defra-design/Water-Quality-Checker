/**
 * Helpers for labelling live API data vs demonstration / pending fields.
 */

function getLocationProvenance (location) {
  return location.isLiveData ? 'live' : 'demo'
}

function getRainfallProvenance (location) {
  if (location.recentRainfall?.isLiveData) return 'live'
  if (!location.isLiveData && location.recentRainfall?.last24h != null) return 'demo'
  return 'pending'
}

function getChemistryProvenance (location, key) {
  if (!location.isLiveData) return 'demo'
  if (['eColi', 'intestinalEnterococci'].includes(key)) {
    return location.waterChemistry[key]?.value != null ? 'live' : 'pending'
  }
  return 'pending'
}

function getOverviewFactorProvenance (overview, factor) {
  if (!overview.isLiveData) return 'demo'
  if (factor === 'rainfall') {
    return overview.avgRainfall != null ? 'live' : 'pending'
  }
  return 'pending'
}

function isOverviewLive (overview) {
  return Boolean(overview.isLiveData)
}

function isOverviewDemo (overview) {
  return !overview.isLiveData
}

module.exports = {
  getLocationProvenance,
  getRainfallProvenance,
  getChemistryProvenance,
  getOverviewFactorProvenance,
  isOverviewLive,
  isOverviewDemo
}
