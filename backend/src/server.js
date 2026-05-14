import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import matchesRoutes from './routes/matches.js';
import leaderboardRoutes from './routes/leaderboard.js';
import tournamentsRoutes from './routes/tournaments.js';
import { errorHandler } from './middleware/error-handler.js';
import { createGameServer } from './websocket/game-server.js'; // 👈 Il nostro nuovo motore di gioco!

dotenv.config();

// Validate JWT_SECRET
if (!process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET is not defined.');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.join(__dirname, '../../frontend');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from frontend
app.use('/webapp2', express.static(frontendPath));
app.use(express.static(frontendPath));

// Routes
app.use('/webapp2/api/auth', authRoutes);
app.use('/webapp2/api/matches', matchesRoutes);
app.use('/webapp2/api/leaderboard', leaderboardRoutes);
app.use('/webapp2/api/tournaments', tournamentsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/tournaments', tournamentsRoutes);

// Serve index.html for root path (SPA fallback)
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});
app.get('/webapp2', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Error handler (must be last)
app.use(errorHandler);

// Avvio del server normale (HTTP)
const server = app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});

// Avvio del server di gioco (WebSocket) agganciato a quello normale
const wss = createGameServer(server);
console.log('✅ WebSocket game server is running');

export default app;