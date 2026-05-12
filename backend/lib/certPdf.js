'use strict'
/**
 * lib/certPdf.js — Generate a PDF certification document using PDFKit.
 *
 * Returns a Buffer so it can be attached to an email without writing to disk.
 * All rendering is synchronous-event-driven: we wrap the stream in a Promise.
 *
 * Usage:
 *   const { generateCertPdf } = require('./certPdf')
 *   const pdfBuffer = await generateCertPdf({ companyName, level, grantedAt, verifyUrl, certId })
 */

const LEVEL_NAMES = {
  1: 'Level 1 — Document Verification',
  2: 'Level 2 — KYC Full Validation',
  3: 'Level 3 — Physical Site Inspection',
}

const LEVEL_COLORS = {
  1: '#CD7F32', // bronze
  2: '#A8A9AD', // silver
  3: '#C9A84C', // gold
}

/**
 * generateCertPdf({ companyName, level, grantedAt, verifyUrl, certId })
 * → Promise<Buffer>
 */
const generateCertPdf = ({ companyName, level, grantedAt, verifyUrl, certId }) =>
  new Promise((resolve, reject) => {
    let PDFDocument
    try {
      PDFDocument = require('pdfkit')
    } catch {
      return reject(new Error('pdfkit not found — run: npm install pdfkit'))
    }

    const doc    = new PDFDocument({ size: 'A4', margin: 60, compress: true })
    const chunks = []

    doc.on('data',  (chunk) => chunks.push(chunk))
    doc.on('end',   ()      => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const levelName  = LEVEL_NAMES[level]  || `Level ${level}`
    const levelColor = LEVEL_COLORS[level] || '#C9A84C'
    const issuedDate = grantedAt
      ? new Date(grantedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

    const W = doc.page.width  - 120  // content width
    const cx = doc.page.width / 2    // centre X

    // ── Background ────────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#0a0a0a')

    // Decorative border frame
    doc
      .rect(24, 24, doc.page.width - 48, doc.page.height - 48)
      .lineWidth(1.5)
      .strokeColor(levelColor)
      .stroke()

    doc
      .rect(30, 30, doc.page.width - 60, doc.page.height - 60)
      .lineWidth(0.5)
      .strokeColor(levelColor)
      .opacity(0.4)
      .stroke()
      .opacity(1)

    // ── Header band ───────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 10).fill(levelColor)

    // ── Logo / issuer ─────────────────────────────────────────────────────────
    doc.moveDown(2)
    doc
      .fontSize(9)
      .fillColor('#888888')
      .font('Helvetica')
      .text('B&E CONSULT FZCO  ·  DUBAI, UAE  ·  mydd.work', { align: 'center' })

    doc.moveDown(0.4)
    doc
      .fontSize(22)
      .fillColor(levelColor)
      .font('Helvetica-Bold')
      .text('B&E TRUSTED REGISTRY', { align: 'center' })

    // ── Title ─────────────────────────────────────────────────────────────────
    doc.moveDown(1.8)
    doc
      .fontSize(11)
      .fillColor('#888888')
      .font('Helvetica')
      .text('THIS CERTIFIES THAT', { align: 'center', characterSpacing: 2 })

    // ── Company name ──────────────────────────────────────────────────────────
    doc.moveDown(0.6)

    // Gold underline
    const nameY = doc.y
    doc
      .fontSize(28)
      .fillColor('#f5f5f5')
      .font('Helvetica-Bold')
      .text(companyName || 'Company', { align: 'center' })

    const afterNameY = doc.y
    // Draw decorative underline
    doc
      .moveTo(cx - 120, afterNameY + 4)
      .lineTo(cx + 120, afterNameY + 4)
      .lineWidth(1)
      .strokeColor(levelColor)
      .stroke()

    doc.y = afterNameY + 14

    // ── Certification level ───────────────────────────────────────────────────
    doc.moveDown(0.5)
    doc
      .fontSize(10)
      .fillColor('#888888')
      .font('Helvetica')
      .text('HAS BEEN AWARDED CERTIFICATION AT', { align: 'center', characterSpacing: 1.5 })

    doc.moveDown(0.5)
    doc
      .fontSize(18)
      .fillColor(levelColor)
      .font('Helvetica-Bold')
      .text(levelName, { align: 'center' })

    // ── Separator ─────────────────────────────────────────────────────────────
    doc.moveDown(1.5)
    const sepY = doc.y
    doc
      .moveTo(cx - 80, sepY).lineTo(cx - 20, sepY)
      .moveTo(cx + 20, sepY).lineTo(cx + 80, sepY)
      .lineWidth(0.8).strokeColor(levelColor).opacity(0.6).stroke().opacity(1)

    // Diamond centre
    doc
      .save()
      .translate(cx, sepY)
      .rotate(45)
      .rect(-4, -4, 8, 8)
      .fillColor(levelColor)
      .fill()
      .restore()

    // ── What was validated ────────────────────────────────────────────────────
    doc.moveDown(1.5)
    const descriptions = {
      1: 'Successfully submitted and verified all required trade documentation\nincluding business registration, tax certificates, and compliance records.',
      2: 'Completed full KYC validation including identity verification,\nbeneficial ownership disclosure, and AML screening.',
      3: 'Passed a physical site inspection conducted by a B&E Certified\nPhysical Audit Controller (PAC) with documented findings.',
    }
    doc
      .fontSize(10)
      .fillColor('#aaaaaa')
      .font('Helvetica')
      .text(descriptions[level] || 'Passed all required verification procedures.', {
        align: 'center',
        width: W,
        x: 60,
      })

    // ── Date & Certificate ID ─────────────────────────────────────────────────
    doc.moveDown(2.5)
    doc
      .fontSize(9)
      .fillColor('#666666')
      .text(`Issued: ${issuedDate}`, { align: 'center' })

    if (certId) {
      doc
        .fontSize(8)
        .fillColor('#444444')
        .text(`Certificate ID: ${certId}`, { align: 'center' })
    }

    // ── Verify URL ────────────────────────────────────────────────────────────
    if (verifyUrl) {
      doc.moveDown(0.6)
      doc
        .fontSize(8)
        .fillColor('#666666')
        .text('Verify online: ', { align: 'center', continued: true })
        .fillColor(levelColor)
        .text(verifyUrl, { align: 'center', link: verifyUrl, underline: true })
    }

    // ── Footer band ───────────────────────────────────────────────────────────
    const footerY = doc.page.height - 10
    doc.rect(0, footerY, doc.page.width, 10).fill(levelColor)

    doc.end()
  })

module.exports = { generateCertPdf }
