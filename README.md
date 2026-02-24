# Battle With Friend

A real-time multiplayer game where players can invite friends, compete, and track their scores on a global leaderboard.

## Features

- ✅ User Registration & Authentication (JWT)
- ✅ Invite System (3-minute expiration)
- ✅ Active Invitations Management
- ✅ Match History
- ✅ Global Leaderboard
- ✅ Score Tracking (+10 win, -5 loss)

## Tech Stack

**Backend:**
- Node.js (ES6 modules)
- Express.js
- MariaDB/MySQL
- JWT Authentication
- bcrypt for password hashing

**Frontend:**
- Vanilla JavaScript (ES6 modules)
- HTML5
- CSS3
- No build tools required

## Project Structure

```
battle-with-friend/
├── backend/
│   ├── src/
│   │   ├── routes/          # API route handlers
│   │   ├── models/          # Database models
│   │   ├── middleware/      # Express middleware
│   │   ├── utils/           # Utility functions
│   │   └── server.js        # Main server file
│   ├── tests/               # Test files
│   ├── database/
│   │   └── migrations/      # SQL migration files
│   ├── package.json
│   ├── .env.example
│   └── .gitignore
└── frontend/
    ├── css/                 # Stylesheets
    ├── js/
    │   ├── api/            # API client modules
    │   └── ui/             # UI components
    ├── index.html          # Login page
    └── dashboard.html      # Main dashboard
```

## Setup Instructions

### 1. Database Setup

Create a MariaDB/MySQL database:

```sql
CREATE DATABASE battle_with_friend;
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your database credentials
# DB_HOST=localhost
# DB_PORT=3306
# DB_USER=your_db_user
# DB_PASSWORD=your_db_password
# DB_NAME=battle_with_friend
# JWT_SECRET=your_jwt_secret_key_here
# PORT=3000

# Run migrations
npm run migrate:001  # Create users table
npm run migrate:002  # Create invitations and matches tables
npm run migrate:004  # Create scores table

# Start the server
npm start

# For development with auto-reload:
npm run dev
```

The backend server will start on `http://localhost:3000`

### 3. Frontend Setup

The frontend is static HTML/CSS/JS and doesn't require a build step.

**Option 1: Simple HTTP Server (Python)**
```bash
cd frontend
python3 -m http.server 8080
```

**Option 2: Live Server (VS Code Extension)**
- Install "Live Server" extension
- Right-click on `index.html` → "Open with Live Server"

**Option 3: Node.js http-server**
```bash
npm install -g http-server
cd frontend
http-server -p 8080
```

The frontend will be available at `http://localhost:8080`

### 4. Configure API URL (if needed)

If your backend is not on `http://localhost:3000`, update the API_BASE_URL in the frontend:

You can either:
- Set `window.API_BASE_URL` in a script tag before loading the modules
- Or edit the files directly in `frontend/js/api/auth-api.js` and `frontend/js/api/match-api.js`

## Usage

### 1. Register a User

1. Open `http://localhost:8080`
2. Click "Register"
3. Enter username (3-50 chars) and password (min 8 chars)
4. Click "Register"

### 2. Login

1. Enter your username and password
2. Click "Login"
3. You'll be redirected to the dashboard

### 3. Send Invitations

1. In the dashboard, enter a friend's username
2. Click "Send Invite"
3. The invitation expires after 3 minutes

### 4. Accept Invitations

1. Active invitations appear in the "Active Invitations" section
2. Click "Accept" to create a match
3. (Note: Game play functionality is not yet implemented in this version)

### 5. View Leaderboard

The leaderboard shows all players sorted by total score:
- Your row is highlighted in blue
- Same scores have the same rank

### 6. View Match History

See your recent matches with:
- Opponent username
- Result (Win/Loss/Cancelled)
- Scores
- Date and time

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Matches & Invitations
- `POST /api/matches/invite` - Send invitation (requires auth)
- `GET /api/matches/invites/active` - Get active invitations (requires auth)
- `POST /api/matches/invites/:id/accept` - Accept invitation (requires auth)
- `GET /api/matches/history` - Get match history (requires auth)
- `POST /api/matches/:id/forfeit` - Forfeit match (requires auth)

### Leaderboard
- `GET /api/leaderboard` - Get global leaderboard (requires auth)

## Database Schema

### users
- `id` - Primary key
- `username` - Unique username
- `password_hash` - Hashed password
- `created_at` - Creation timestamp

### invitations
- `id` - Primary key
- `inviter_id` - Foreign key to users
- `invitee_id` - Foreign key to users
- `status` - pending/accepted/expired/cancelled
- `expires_at` - Expiration timestamp (3 minutes)
- `created_at` - Creation timestamp

### matches
- `id` - Primary key
- `player1_id` - Foreign key to users
- `player2_id` - Foreign key to users
- `status` - pending/active/completed/cancelled
- `winner_id` - Foreign key to users (nullable)
- `created_at` - Creation timestamp

### scores
- `id` - Primary key
- `match_id` - Foreign key to matches
- `player_id` - Foreign key to users
- `score` - Current total score
- `score_change` - Score change (+10 win, -5 loss)
- `created_at` - Creation timestamp

## Testing

```bash
cd backend
npm test
```

## Architecture Decisions

### Backend
- **No ORM**: Raw SQL queries for maximum control and performance
- **Manual Migrations**: SQL files for database versioning
- **JWT Authentication**: Stateless authentication with 24h token expiration
- **Error Handling**: Custom error classes with consistent format
- **Naming Convention**: snake_case in database, camelCase in API responses

### Frontend
- **No Build Step**: Native ES6 modules for simplicity
- **Vanilla JS**: No framework dependencies
- **Component-Based**: Separated UI components and API clients
- **Auto-Refresh**: Dashboard auto-refreshes every 10 seconds

### Security
- **Password Hashing**: bcrypt with 10 salt rounds
- **JWT Tokens**: Signed with secret key, 24h expiration
- **Input Validation**: express-validator on all endpoints
- **SQL Injection Prevention**: Prepared statements with parameterized queries
- **Authentication Required**: Protected endpoints with JWT middleware

## Future Enhancements

The following features are documented but not yet implemented:
- WebSocket for real-time game play
- Game logic and physics
- Victory conditions
- Heartbeat/disconnection handling
- Match cancellation on timeout

## Troubleshooting

### Database Connection Issues
- Verify database credentials in `.env`
- Ensure MariaDB/MySQL is running
- Check database user has proper permissions

### JWT Errors
- Ensure JWT_SECRET is set in `.env`
- Token expires after 24h - login again if needed

### CORS Errors
- Backend includes CORS middleware
- Ensure frontend and backend URLs are correct

### Migration Errors
- Run migrations in order: 001, 002, 004
- Check database connection before running migrations

## License

ISC

## Contributors

Auto-generated by Claude AI
