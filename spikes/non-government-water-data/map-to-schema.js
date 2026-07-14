/**
 * Draft canonical shape for non-designated discovery sites.
 * Experimental — not used by the live prototype.
 */

/**
 * @typedef {object} DiscoverySite
 * @property {string} id
 * @property {string} name
 * @property {{ lat: number, lng: number }} coordinates
 * @property {'crt_reservoir' | string} siteKind
 * @property {'asset_register'} confidenceFloor
 * @property {string} waterbodyType
 * @property {string|null} waterwayName
 * @property {string|null} operatorAssetId
 * @property {{ name: string, url: string, licence: string, checkedOn: string }} source
 * @property {string[]} notices
 */

const CRT_SOURCE = {
  name: 'Canal & River Trust Reservoirs',
  url: 'https://data-canalrivertrust.opendata.arcgis.com/datasets/CanalRiverTrust::canal-and-river-trust-reservoirs-view',
  licence: 'Open Government Licence (as listed on CRT Hub 2026-07-14 — reconfirm before production)',
  checkedOn: '2026-07-14'
}

/**
 * @param {object} feature GeoJSON Feature
 * @returns {DiscoverySite|null}
 */
function mapCrtReservoirFeature (feature) {
  if (!feature || feature.type !== 'Feature') return null
  const props = feature.properties || {}
  const geometry = feature.geometry
  if (!geometry) return null

  let lng
  let lat
  if (geometry.type === 'Point') {
    ;[lng, lat] = geometry.coordinates
  } else if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
    // rough centroid of outer ring
    const ring = geometry.type === 'Polygon'
      ? geometry.coordinates[0]
      : geometry.coordinates[0][0]
    let sx = 0
    let sy = 0
    for (const [x, y] of ring) {
      sx += x
      sy += y
    }
    lng = sx / ring.length
    lat = sy / ring.length
  } else {
    return null
  }

  const assetId = props.sap_func_loc || props.OBJECTID
  const name = props.sap_description || `CRT reservoir ${assetId}`

  return {
    id: `crt-reservoir-${String(assetId).toLowerCase().replace(/\s+/g, '-')}`,
    name,
    coordinates: { lat, lng },
    siteKind: 'crt_reservoir',
    confidenceFloor: 'asset_register',
    waterbodyType: 'reservoir',
    waterwayName: props.waterway_name || null,
    operatorAssetId: props.sap_func_loc || null,
    source: { ...CRT_SOURCE },
    notices: [
      'CRT asset register location — not an Environment Agency designated bathing water.',
      'Does not include water-quality test results. Swimming may be restricted or prohibited.'
    ]
  }
}

/**
 * @param {object} featureCollection
 * @returns {DiscoverySite[]}
 */
function mapCrtReservoirCollection (featureCollection) {
  const features = featureCollection?.features || []
  return features.map(mapCrtReservoirFeature).filter(Boolean)
}

module.exports = {
  CRT_SOURCE,
  mapCrtReservoirFeature,
  mapCrtReservoirCollection
}
