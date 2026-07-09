/**
 * Ordnance Survey Maps API client
 * https://osdatahub.os.uk/docs/wmts/overview
 *
 * Serves MapLibre-compatible raster basemap styles (Web Mercator / EPSG:3857).
 * Set OS_MAPS_API_KEY in .env (local) or Heroku config vars (production).
 */

const TILES_BASE = 'https://api.os.uk/maps/raster/v1/zxy'
const VALID_LAYERS = ['Road_3857', 'Outdoor_3857', 'Light_3857']

const OPENFREEMAP_STYLE = {
  url: 'https://tiles.openfreemap.org/styles/liberty',
  attribution: 'OpenFreeMap © OpenMapTiles · Data from OpenStreetMap',
  backgroundColor: '#f5f5f0',
  id: 'openfreemap-liberty',
  source: 'OpenFreeMap'
}

function getApiKey () {
  return process.env.OS_MAPS_API_KEY || ''
}

function isConfigured () {
  return Boolean(getApiKey())
}

function getLayerName () {
  const layer = process.env.OS_MAPS_LAYER || 'Outdoor_3857'
  return VALID_LAYERS.includes(layer) ? layer : 'Outdoor_3857'
}

function getLayerLabel (layerName) {
  const labels = {
    Road_3857: 'Road',
    Outdoor_3857: 'Outdoor',
    Light_3857: 'Light'
  }
  return labels[layerName] || 'Outdoor'
}

/**
 * MapLibre GL style object for OS Maps API raster tiles.
 */
function getMapLibreStyle () {
  const apiKey = getApiKey()
  const layer = getLayerName()

  return {
    version: 8,
    sources: {
      'os-maps': {
        type: 'raster',
        tiles: [`${TILES_BASE}/${layer}/{z}/{x}/{y}.png?key=${apiKey}`],
        tileSize: 256,
        attribution: '© Crown copyright and database rights. Ordnance Survey',
        maxzoom: 19
      }
    },
    layers: [{
      id: 'os-maps',
      type: 'raster',
      source: 'os-maps'
    }]
  }
}

/**
 * Map style config for Defra Interactive Map (MapLibre provider).
 */
function getMapStyleConfig () {
  if (!isConfigured()) {
    return { ...OPENFREEMAP_STYLE, isLiveData: false }
  }

  const layer = getLayerName()
  return {
    url: '/map/os-style',
    attribution: `© Ordnance Survey (${getLayerLabel(layer)} style)`,
    backgroundColor: '#f3f2f1',
    id: `os-${layer.toLowerCase()}`,
    source: 'Ordnance Survey Maps API',
    layer,
    isLiveData: true
  }
}

module.exports = {
  isConfigured,
  getApiKey,
  getLayerName,
  getMapLibreStyle,
  getMapStyleConfig
}
