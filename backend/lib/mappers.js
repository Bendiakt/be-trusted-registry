'use strict'

const mapCompanyRow = (row) => {
  if (!row) return null
  return {
    id:              row.id,
    userId:          row.user_id,
    name:            row.name,
    companyName:     row.company_name || row.name || '',
    industry:        row.industry,
    sector:          row.sector || row.industry || '',
    country:         row.country,
    description:     row.description,
    website:         row.website,
    status:          row.status,
    certificationLevel: row.certification_level || 0,
    level:           row.certification_level || 0,
    badge:           (row.certification_level || 0) > 0 ? 'certified' : 'not-certified',
    verifiedAt:      row.verified_at      || null,
    suspendedAt:     row.suspended_at     || null,
    suspendedReason: row.suspended_reason || null,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  }
}

const mapMissionRow = (row) => {
  if (!row) return null
  return {
    id:           row.id,
    company_id:   row.company_id,
    company_name: row.company_name || '',
    location:     row.location     || '',
    type:         row.type         || '',
    description:  row.description  || '',
    fee:          row.fee_usd      || 500,
    assigned_to:  row.assigned_to,
    status:       row.status,
    createdAt:    row.created_at,
    reportText:   row.report_text  || null,
    outcome:      row.outcome      || null,
    completedAt:  row.completed_at || null,
  }
}

module.exports = { mapCompanyRow, mapMissionRow }
