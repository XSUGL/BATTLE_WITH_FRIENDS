import express from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { getLeaderboard } from '../models/score-model.js';

const router = express.Router();

router.get(
  '/',
  authenticate,
  async (req, res, next) => {
    try {
      const currentUserId = req.user.id;
      const leaderboard = await getLeaderboard(currentUserId);
      
      res.status(200).json(leaderboard);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
