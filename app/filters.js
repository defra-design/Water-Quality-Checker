//
// For guidance on how to create filters see:
// https://prototype-kit.service.gov.uk/docs/filters
//

const govukPrototypeKit = require('govuk-prototype-kit')
const addFilter = govukPrototypeKit.views.addFilter
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

addFilter('formatDate', (isoString) => {
  return waterService.formatDate(isoString)
})

addFilter('formatRelativeTime', (isoString) => {
  return waterService.formatRelativeTime(isoString)
})

addFilter('activityLabel', (status) => {
  return waterService.getStatusLabel(status)
})

addFilter('chemistryLabel', (key) => {
  return chemistryLabels[key] || key
})

addFilter('slug', (value) => {
  if (!value) return ''
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
})

addFilter('nl2p', (text) => {
  if (!text) return ''
  return text.split('\n\n').map(paragraph => {
    if (paragraph.startsWith('- ')) {
      const items = paragraph.split('\n').map(item => `<li>${item.replace(/^- /, '')}</li>`).join('')
      return `<ul class="govuk-list govuk-list--bullet">${items}</ul>`
    }
    if (paragraph.includes('\n- ')) {
      const parts = paragraph.split('\n')
      const intro = parts[0]
      const items = parts.filter(p => p.startsWith('- ')).map(item => `<li>${item.replace(/^- /, '')}</li>`).join('')
      return `<p class="govuk-body">${intro}</p><ul class="govuk-list govuk-list--bullet">${items}</ul>`
    }
    const formatted = paragraph
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>')
    return `<p class="govuk-body">${formatted}</p>`
  }).join('')
})
