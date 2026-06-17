// rekognition-proxy-local/server.mjs
// LOCAL DEVELOPMENT ONLY proxy for AWS Rekognition DetectFaces.
// The AWS secret lives here (server-side), never in the browser bundle.
//
// Setup:
//   1. cd rekognition-proxy-local
//   2. npm install
//   3. Set env vars (PowerShell):
//        $env:AWS_ACCESS_KEY_ID="AKIA..."; $env:AWS_SECRET_ACCESS_KEY="..."; $env:AWS_REGION="us-east-2"
//   4. node server.mjs   → listens on http://localhost:3002/analyze-face
//
// NEVER commit real credentials. NEVER deploy this file with hardcoded keys.

import express from 'express'
import cors from 'cors'
import { RekognitionClient, DetectFacesCommand } from '@aws-sdk/client-rekognition'

const PORT = process.env.PORT ?? 3002
const REGION = process.env.AWS_REGION ?? 'us-east-2'

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.warn('[proxy] WARNING: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY not set — calls will fail with a credentials error.')
}

const client = new RekognitionClient({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  },
})

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.get('/health', (_req, res) => res.json({ ok: true, region: REGION }))

app.post('/analyze-face', async (req, res) => {
  const { imageBase64, questionIdx, timestampMs } = req.body ?? {}

  if (!imageBase64) {
    return res.status(400).json({ success: false, error: 'imageBase64 required' })
  }
  // Reject tiny/blank frames (< ~5KB) without spending an API call
  const byteEstimate = (imageBase64.length * 3) / 4
  if (byteEstimate < 5000) {
    return res.json({ success: false, reason: 'frame_too_small', questionIdx, timestampMs })
  }

  try {
    const command = new DetectFacesCommand({
      Image: { Bytes: Buffer.from(imageBase64, 'base64') },
      Attributes: ['ALL'], // emotions, landmarks, quality, pose, gaze
    })
    const response = await client.send(command)
    res.json({
      success: true,
      faceDetails: response.FaceDetails ?? [],
      questionIdx,
      timestampMs,
    })
  } catch (err) {
    console.error('[proxy] Rekognition error:', err?.name, err?.message)
    res.status(500).json({ success: false, error: err?.message ?? String(err) })
  }
})

app.listen(PORT, () => {
  console.log(`[proxy] Rekognition proxy on http://localhost:${PORT}/analyze-face  (region ${REGION})`)
})
