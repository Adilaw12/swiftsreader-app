// app/api/mathpix/route.ts
// POST /api/mathpix — PDF processing via Mathpix API
// Uploads a PDF, polls until complete, returns structured text + figures + tables + equations
// Tier limits: FREE/STUDENT = pdf.js only | PRO/BETA = Mathpix full extraction

import { NextRequest, NextResponse } from 'next/server'

function apiError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status })
}

const MATHPIX_APP_ID  = process.env.MATHPIX_APP_ID!
const MATHPIX_APP_KEY = process.env.MATHPIX_APP_KEY!
const MATHPIX_BASE    = 'https://api.mathpix.com/v3'

// Poll interval and max wait
const POLL_INTERVAL_MS = 2000
const MAX_WAIT_MS      = 100_000 // 100s max (well within Vercel Pro 120s limit)

async function mathpixHeaders() {
  return {
    'app_id':  MATHPIX_APP_ID,
    'app_key': MATHPIX_APP_KEY,
  }
}

async function uploadPDF(pdfBuffer: Buffer, filename: string): Promise<string> {
  const formData = new FormData()
  const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' })
  formData.append('file', blob, filename)

  // Upload with processing options — conversion happens after processing
  formData.append('options_json', JSON.stringify({
    math_inline_delimiters:  ['$', '$'],
    math_display_delimiters: ['$$', '$$'],
    rm_spaces: true,
    enable_tables_fallback: true,
    include_page_info: false,
  }))

  const resp = await fetch(`${MATHPIX_BASE}/pdf`, {
    method:  'POST',
    headers: await mathpixHeaders(),
    body:    formData,
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Mathpix upload failed ${resp.status}: ${err.slice(0, 300)}`)
  }

  const data = await resp.json()
  console.log('[Mathpix] Upload response:', JSON.stringify(data).slice(0, 300))
  if (!data.pdf_id) throw new Error(`Mathpix did not return a pdf_id. Response: ${JSON.stringify(data).slice(0, 200)}`)
  return data.pdf_id
}

async function pollUntilComplete(pdfId: string): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < MAX_WAIT_MS) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    const resp = await fetch(`${MATHPIX_BASE}/pdf/${pdfId}`, {
      headers: await mathpixHeaders(),
    })
    if (!resp.ok) continue
    const data = await resp.json()
    const status = data.status
    if (status === 'completed') return
    if (status === 'error') throw new Error(`Mathpix processing error: ${JSON.stringify(data.error)}`)
    // status === 'processing' or 'split' — keep polling
  }
  throw new Error('Mathpix processing timed out after 2 minutes')
}

async function fetchMMD(pdfId: string): Promise<string> {
  const resp = await fetch(`${MATHPIX_BASE}/pdf/${pdfId}.mmd`, {
    headers: await mathpixHeaders(),
  })
  if (!resp.ok) throw new Error(`Mathpix MMD fetch failed: ${resp.status}`)
  return resp.text()
}

async function fetchLinesJSON(pdfId: string): Promise<any[]> {
  const resp = await fetch(`${MATHPIX_BASE}/pdf/${pdfId}.lines.json`, {
    headers: await mathpixHeaders(),
  })
  if (!resp.ok) return []
  const data = await resp.json()
  return data.lines || []
}

// Parse Mathpix MMD into structured content:
// Returns { text, figures, tables, equations }
function parseMMD(mmd: string) {
  const lines = mmd.split('\n')
  const figures:   { number: number; caption: string; image?: string }[]  = []
  const tables:    { number: number; caption: string; content: string }[]  = []
  const equations: { number: number; latex: string }[]                     = []

  let figCount = 0, tableCount = 0, eqCount = 0
  let cleanLines: string[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // ── Figures: ![caption](url) ──────────────────────────────────────────
    const figMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/)
    if (figMatch) {
      figCount++
      figures.push({
        number:  figCount,
        caption: figMatch[1] || `Figure ${figCount}`,
        image:   figMatch[2],
      })
      cleanLines.push(`[FIGURE_${figCount}]`)
      i++; continue
    }

    // ── Tables: | ... | ──────────────────────────────────────────────────
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      tableCount++
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      const caption = tableLines[0] || `Table ${tableCount}`
      tables.push({
        number:  tableCount,
        caption: `Table ${tableCount}`,
        content: tableLines.join('\n'),
      })
      cleanLines.push(`[TABLE_${tableCount}]`)
      continue
    }

    // ── Display equations: $$ ... $$ ─────────────────────────────────────
    if (line.trim().startsWith('$$')) {
      eqCount++
      const eqLines: string[] = [line]
      if (!line.trim().endsWith('$$') || line.trim() === '$$') {
        i++
        while (i < lines.length && !lines[i].trim().endsWith('$$')) {
          eqLines.push(lines[i]); i++
        }
        if (i < lines.length) eqLines.push(lines[i])
      }
      const latex = eqLines.join('\n').replace(/\$\$/g, '').trim()
      equations.push({ number: eqCount, latex })
      // Keep equation inline as text marker so reader can show it
      cleanLines.push(`[EQ: ${latex.slice(0, 80)}]`)
      i++; continue
    }

    cleanLines.push(line)
    i++
  }

  const text = cleanLines
    .join('\n')
    // Clean up Mathpix markdown artifacts
    .replace(/#{1,6}\s*/g, '')          // remove heading markers
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1')      // italic
    .replace(/`([^`]+)`/g, '$1')        // inline code
    .replace(/\$([^$]+)\$/g, '$1')      // inline math — keep the text
    .trim()

  return { text, figures, tables, equations }
}

export async function POST(req: NextRequest) {
  try {
    if (!MATHPIX_APP_ID || !MATHPIX_APP_KEY) {
      return apiError('Mathpix not configured', 503)
    }

    // ── Auth + tier check ──────────────────────────────────────────────────
    let userId: string | null = null
    let userTier = 'FREE'
    try {
      const { auth } = await import('@clerk/nextjs/server')
      const session = await auth()
      userId = session?.userId ?? null
    } catch {}

    if (userId) {
      try {
        const { prisma } = await import('@/lib/prisma')
        const user = await prisma.user.findUnique({
          where:  { id: userId },
          select: { tier: true },
        })
        userTier = user?.tier ?? 'FREE'
      } catch {}
    }

    // TEMPORARY TEST BYPASS — set MATHPIX_TEST_BYPASS=true in Vercel to skip tier check
    // Remove this env var once Stripe is live and real Pro users exist
    const testBypass = process.env.MATHPIX_TEST_BYPASS === 'true'
    if (testBypass) {
      console.log('[Mathpix] Test bypass active — skipping tier check')
    }

    // Only Pro and Beta users get Mathpix extraction (unless bypass is active)
    const allowedTiers = ['PRO', 'BETA']
    if (!testBypass && !allowedTiers.includes(userTier.toUpperCase())) {
      return NextResponse.json({
        error:    'Mathpix extraction requires a Pro plan.',
        fallback: true,
      }, { status: 403 })
    }

    // ── Read PDF from request ──────────────────────────────────────────────
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return apiError('No file provided', 400)

    const filename  = file.name || 'document.pdf'
    const pdfBuffer = Buffer.from(await file.arrayBuffer())

    console.log(`[Mathpix] Processing: ${filename} (${pdfBuffer.length} bytes) for user ${userId}`)

    // ── Upload → Poll → Fetch ──────────────────────────────────────────────
    const pdfId = await uploadPDF(pdfBuffer, filename)
    console.log(`[Mathpix] pdf_id: ${pdfId}`)

    await pollUntilComplete(pdfId)
    console.log(`[Mathpix] Completed: ${pdfId}`)

    const mmd = await fetchMMD(pdfId)

    // ── Parse structured content ───────────────────────────────────────────
    const { text, figures, tables, equations } = parseMMD(mmd)

    console.log(`[Mathpix] Extracted: ${text.length} chars, ${figures.length} figures, ${tables.length} tables, ${equations.length} equations`)

    return NextResponse.json({
      text,
      figures,
      tables,
      equations,
      pdfId,
    })

  } catch (err) {
    console.error('[POST /api/mathpix]', err)
    return apiError(`Mathpix processing failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}
