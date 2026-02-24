import express from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import { createUser, findByUsername, verifyPassword } from '../models/user-model.js';
import { ValidationError, AuthenticationError } from '../utils/errors.js';

const router = express.Router();

// ==========================================
// 1. REGISTRATION ENDPOINT
// ==========================================
router.post(
  '/register',
  [
    body('username')
      .isString()
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Username must be between 3 and 50 characters'),
    body('password')
      .isString()
      .isLength({ min: 8, max: 128 })
      .withMessage('Password must be between 8 and 128 characters')
  ],
  async (req, res, next) => {
    try {
      // 1. Controlla errori di validazione input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', errors.array());
      }
      
      const { username, password } = req.body;
      
      try {
        // 2. Crea direttamente l'utente. 
        // Se l'username esiste già, il database lancerà l'errore ER_DUP_ENTRY.
        const user = await createUser(username, password);
        
        // 3. Genera JWT Token
        const token = jwt.sign(
          { id: user.id, username: user.username },
          process.env.JWT_SECRET,
          { expiresIn: '24h' }
        );
        
        // 4. Risponde al client
        res.status(201).json({
          user: {
            id: user.id,
            username: user.username
          },
          token
        });
      } catch (dbError) {
        // Se MariaDB lancia errore di "Chiave Duplicata", l'utente esiste
        if (dbError.code === 'ER_DUP_ENTRY') {
          throw new ValidationError('Username already exists');
        }
        // Altrimenti è un errore grave del DB
        throw dbError; 
      }
    } catch (error) {
      next(error);
    }
  }
);

// ==========================================
// 2. LOGIN ENDPOINT
// ==========================================
router.post(
  '/login',
  [
    body('username').isString().trim().notEmpty().withMessage('Username is required'),
    body('password').isString().notEmpty().withMessage('Password is required')
  ],
  async (req, res, next) => {
    try {
      // 1. Controlla errori di validazione input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', errors.array());
      }

      const { username, password } = req.body;

      // 2. Cerca utente
      const user = await findByUsername(username);
      
      // Se l'utente non esiste, lancia errore
      if (!user) {
        throw new AuthenticationError('Invalid credentials');
      }

      // 3. Verifica password
      const isValidPassword = await verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        throw new AuthenticationError('Invalid credentials');
      }

      // 4. Genera JWT Token
      const token = jwt.sign(
        { id: user.id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      // 5. Risponde al client
      res.status(200).json({
        user: {
          id: user.id,
          username: user.username
        },
        token
      });
    } catch (error) {
      next(error);
    }
  }
);

// ESPORTAZIONE FONDAMENTALE (quella che mancava e causava il crash)
export default router;