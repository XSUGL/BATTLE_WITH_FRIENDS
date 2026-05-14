import express from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate } from '../middleware/authenticate.js';
import {
  createTournament,
  findTournamentById,
  listTournaments,
  getParticipants,
  getBracket,
  joinTournament,
  isAllowedSize,
  findOpenTournamentMatchForUser
} from '../models/tournament-model.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';

const router = express.Router();

// ── POST /api/tournaments — crea un nuovo torneo (lobby aperta) ──
router.post(
  '/',
  authenticate,
  [
    body('name').isString().trim().isLength({ min: 3, max: 80 })
      .withMessage('Name must be between 3 and 80 characters'),
    body('size').isInt().toInt()
      .withMessage('Size must be an integer'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) throw new ValidationError('Validation failed', errors.array());

      const { name, size } = req.body;
      if (!isAllowedSize(size)) {
        throw new ValidationError('Size must be one of: 2, 4, 8, 16, 32');
      }

      const created = await createTournament({
        name, size: Number(size), creatorId: req.user.id
      });
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/tournaments/:id/join ──
router.post(
  '/:id/join',
  authenticate,
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) throw new ValidationError('Invalid tournament id');

      const result = await joinTournament(id, req.user.id);
      res.status(200).json({
        tournament: result.tournament,
        justStarted: result.justStarted
      });
    } catch (err) {
      if (err.code === 'NOT_FOUND')      return next(new NotFoundError('Tournament not found'));
      if (err.code === 'NOT_OPEN')       return next(new ValidationError('Tournament is no longer open'));
      if (err.code === 'ALREADY_JOINED') return next(new ValidationError('You already joined this tournament'));
      if (err.code === 'FULL')           return next(new ValidationError('Tournament is full'));
      next(err);
    }
  }
);

// ── GET /api/tournaments — lista tornei (default: lobby + running) ──
router.get(
  '/',
  authenticate,
  async (req, res, next) => {
    try {
      const list = await listTournaments({ statuses: ['lobby', 'running'], limit: 50 });
      res.status(200).json(list);
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/tournaments/:id — dettagli torneo + partecipanti + bracket ──
router.get(
  '/:id',
  authenticate,
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) throw new ValidationError('Invalid tournament id');

      const t = await findTournamentById(id);
      if (!t) throw new NotFoundError('Tournament not found');

      const [participants, bracket] = await Promise.all([
        getParticipants(id),
        getBracket(id)
      ]);

      // Match aperto del polling: per il browser dell'utente loggato
      const openMatch = await findOpenTournamentMatchForUser(req.user.id);
      const myOpenMatch = (openMatch && openMatch.tournamentId === id) ? openMatch : null;

      res.status(200).json({
        ...t,
        participants,
        bracket,
        myOpenMatch
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
