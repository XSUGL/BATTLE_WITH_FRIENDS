import express from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate } from '../middleware/authenticate.js';
import { 
  createInvitation, 
  findUserByUsername, 
  findActiveInvitationsByInvitee,
  acceptInvitation
} from '../models/invitation-model.js';
import { getMatchHistory, completeMatch } from '../models/match-model.js';
import { saveMatchResults } from '../models/score-model.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import pool from '../utils/db.js';

const router = express.Router();

// Create invitation
router.post(
  '/invite',
  authenticate,
  [
    body('username')
      .isString()
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Username must be between 3 and 50 characters')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', errors.array());
      }
      
      const { username } = req.body;
      const inviterId = req.user.id;
      
      // Find invitee
      const invitee = await findUserByUsername(username);
      if (!invitee) {
        throw new NotFoundError('User not found');
      }
      
      // Check if inviting self
      if (invitee.id === inviterId) {
        throw new ValidationError('You cannot invite yourself');
      }
      
      // Create invitation
      const invitation = await createInvitation(inviterId, invitee.id);
      
      res.status(201).json(invitation);
    } catch (error) {
      next(error);
    }
  }
);

// Get active invitations
router.get(
  '/invites/active',
  authenticate,
  async (req, res, next) => {
    try {
      const inviteeId = req.user.id;
      const invitations = await findActiveInvitationsByInvitee(inviteeId);
      
      res.status(200).json(invitations);
    } catch (error) {
      next(error);
    }
  }
);

// Accept invitation
router.post(
  '/invites/:id/accept',
  authenticate,
  async (req, res, next) => {
    try {
      const invitationId = parseInt(req.params.id);
      const inviteeId = req.user.id;
      
      if (isNaN(invitationId)) {
        throw new ValidationError('Invalid invitation ID');
      }
      
      const result = await acceptInvitation(invitationId, inviteeId);
      
      res.status(200).json(result);
    } catch (error) {
      if (error.message === 'Invitation not found') {
        return next(new NotFoundError('Invitation not found'));
      }
      if (error.message === 'Invitation has expired' || 
          error.message === 'Invitation is not pending' ||
          error.message === 'You are not the recipient of this invitation') {
        return next(new ValidationError(error.message));
      }
      next(error);
    }
  }
);

// Get match history
router.get(
  '/history',
  authenticate,
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const history = await getMatchHistory(userId, 50);
      
      res.status(200).json(history);
    } catch (error) {
      next(error);
    }
  }
);

// Forfeit match
router.post(
  '/:id/forfeit',
  authenticate,
  async (req, res, next) => {
    try {
      const matchId = parseInt(req.params.id);
      const userId = req.user.id;
      
      if (isNaN(matchId)) {
        throw new ValidationError('Invalid match ID');
      }
      
      const conn = await pool.getConnection();
      
      try {
        await conn.beginTransaction();
        
        const match = await conn.query(
          'SELECT * FROM matches WHERE id = ?',
          [matchId]
        );
        
        if (match.length === 0) {
          throw new NotFoundError('Match not found');
        }
        
        const matchData = match[0];
        
        if (matchData.player1_id !== userId && matchData.player2_id !== userId) {
          throw new ValidationError('You are not a player in this match');
        }
        
        if (matchData.status !== 'active') {
          throw new ValidationError('Match is not active');
        }
        
        // Determine winner (opponent)
        const winnerId = matchData.player1_id === userId ? matchData.player2_id : matchData.player1_id;
        const loserId = userId;
        
        // Complete match
        await completeMatch(matchId, winnerId, conn);
        
        // Save scores
        await saveMatchResults(matchId, winnerId, loserId, conn);
        
        await conn.commit();
        
        res.status(200).json({
          message: 'Match forfeited',
          matchId,
          winnerId
        });
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    } catch (error) {
      next(error);
    }
  }
);

export default router;
