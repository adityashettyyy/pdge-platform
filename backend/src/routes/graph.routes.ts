// src/routes/graph.routes.ts
import { Router } from 'express'
import { graphController } from '../controllers/graph.controller'
import { authenticate, requireRole } from '../middleware/auth'

const router = Router()

router.use(authenticate)

router.get('/nodes',           graphController.getNodes)
router.get('/edges',           graphController.getEdges)
router.get('/snapshot',        graphController.getSnapshot)
router.put('/edges/:id/block', requireRole(['OPERATOR', 'AGENCY_LEAD', 'ADMIN']), graphController.blockEdge)
router.put('/edges/:id/unblock', requireRole(['OPERATOR', 'AGENCY_LEAD', 'ADMIN']), graphController.unblockEdge)

export default router
