import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'

import incidentRoutes from './routes/incident.routes'
import graphRoutes from './routes/graph.routes'
import { errorHandler, notFound } from './middleware/error'

const app = express()

// Security
app.use(helmet())

app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
}))

// Parsing
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Logging
app.use(
  morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev')
)

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'pdge-backend',
    ts: new Date().toISOString(),
  })
})

// Routes
app.use('/api/incidents', incidentRoutes)
app.use('/api/graph', graphRoutes)

// Error handlers (must be last)
app.use(notFound)
app.use(errorHandler)

export default app