import { Router, Request, Response, NextFunction } from 'express'

export const incidentController = {

  async report(req: Request, res: Response, next: NextFunction) {
    try {
      return res.json({
        success: true,
        message: 'Incident reported'
      })
    } catch (err) {
      return next(err)
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      return res.json({
        success: true,
        data: []
      })
    } catch (err) {
      return next(err)
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params

      return res.json({
        success: true,
        data: { id }
      })
    } catch (err) {
      return next(err)
    }
  },

  async addReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params

      return res.json({
        success: true,
        message: `Report added to incident ${id}`
      })
    } catch (err) {
      return next(err)
    }
  },

  async close(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params

      return res.json({
        success: true,
        message: `Incident ${id} closed`
      })
    } catch (err) {
      return next(err)
    }
  }

}

// Attach routes to an express router so the module can be imported as a default
const router = Router()

router.post('/report', incidentController.report)
router.get('/', incidentController.list)
router.get('/:id', incidentController.getById)
router.post('/:id/report', incidentController.addReport)
router.post('/:id/close', incidentController.close)

export default router
