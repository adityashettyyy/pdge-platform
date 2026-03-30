// src/controllers/graph.controller.ts

import { Request, Response, NextFunction } from 'express'
import { prisma } from '../config/db'
import { digitalTwinService } from '../services/digital-twin.service'
import { ApiResponse } from '../types'

// Extend Express Request type
interface AuthenticatedRequest extends Request {
  organizationId?: string
}

export const graphController = {

  // GET /api/graph/nodes
  async getNodes(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const organizationId = req.organizationId!

      const snapshot = await digitalTwinService.loadGraph(organizationId)

      const response: ApiResponse<any> = {
        success: true,
        data: {
          nodes: snapshot.nodes,
          count: snapshot.nodes.length,
          cachedAt: snapshot.snapshotAt,
        },
      }

      return res.json(response)

    } catch (err) {
      next(err)
    }
  },

  // GET /api/graph/edges
  async getEdges(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const organizationId = req.organizationId!
      const snapshot = await digitalTwinService.loadGraph(organizationId)

      const response: ApiResponse<any> = {
        success: true,
        data: {
          edges: snapshot.edges,
          count: snapshot.edges.length,
        },
      }

      return res.json(response)

    } catch (err) {
      next(err)
    }
  },

  // GET /api/graph/snapshot
  async getSnapshot(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const organizationId = req.organizationId!
      const snapshot = await digitalTwinService.loadGraph(organizationId)
      const riskMap = await digitalTwinService.getRiskMap(organizationId)

      const response: ApiResponse<any> = {
        success: true,
        data: {
          ...snapshot,
          riskMap,
        },
      }

      return res.json(response)

    } catch (err) {
      next(err)
    }
  },

  // PUT /api/graph/edges/:id/block
  async blockEdge(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string
      const organizationId = req.organizationId!
      const { reason } = req.body

      const edge = await prisma.graphEdge.findFirst({
        where: { id, organizationId },
      })

      if (!edge) {
        return res.status(404).json({
          success: false,
          error: 'Edge not found',
        })
      }

      await digitalTwinService.blockEdge(
        edge.id,
        reason ?? 'Manual block'
      )

      return res.json({
        success: true,
        data: {
          message: `Edge ${id} blocked. All observers notified via WebSocket.`,
        },
      })

    } catch (err) {
      next(err)
    }
  },

  // PUT /api/graph/edges/:id/unblock
  async unblockEdge(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string
      const organizationId = req.organizationId!

      await prisma.graphEdge.updateMany({
        where: { id, organizationId },
        data: { status: 'OPEN', blockedReason: null },
      })

      return res.json({
        success: true,
        data: { message: `Edge ${id} unblocked.` },
      })

    } catch (err) {
      next(err)
    }
  },
}