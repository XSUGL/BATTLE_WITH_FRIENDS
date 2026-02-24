# 📖 GIT SETUP GUIDE — Battle With Friend

Guida completa per inizializzare il repository Git, capire la struttura
e pubblicare il progetto su GitHub.

---

## 🗂 STRUTTURA COMPLETA DEL REPOSITORY

```
battle-with-friend/                  ← radice del repository Git
│
├── .gitignore                       ← file/cartelle ignorati da Git
├── README.md                        ← documentazione progetto
│
├── backend/                         ← tutto il codice server (Node.js)
│   ├── .env.example                 ← TEMPLATE variabili d'ambiente (committato)
│   ├── .gitignore                   ← ignora .env locale
│   ├── package.json                 ← dipendenze e script npm
│   ├── jest.config.js               ← configurazione test
│   │
│   ├── database/
│   │   └── migrations/              ← script SQL eseguiti in ordine
│   │       ├── 001_create_users.sql
│   │       ├── 002_create_invitations_matches.sql
│   │       └── 004_create_scores.sql
│   │
│   └── src/
│       ├── server.js                ← ENTRY POINT — avvia Express + routes
│       │
│       ├── middleware/              ← funzioni che si eseguono prima/dopo routes
│       │   ├── authenticate.js      ← verifica JWT token
│       │   └── error-handler.js     ← cattura e formatta tutti gli errori
│       │
│       ├── models/                  ← query SQL al database
│       │   ├── user-model.js        ← CRUD utenti
│       │   ├── invitation-model.js  ← CRUD inviti + expiration
│       │   ├── match-model.js       ← CRUD partite + storico
│       │   └── score-model.js       ← punteggi + leaderboard
│       │
│       ├── routes/                  ← endpoint HTTP (cosa risponde il server)
│       │   ├── auth.js              ← POST /api/auth/register, /api/auth/login
│       │   ├── matches.js           ← POST /invite, GET /invites/active, ecc.
│       │   └── leaderboard.js       ← GET /api/leaderboard
│       │
│       └── utils/                   ← funzioni di supporto riusabili
│           ├── db.js                ← crea il pool di connessioni MariaDB
│           ├── errors.js            ← classi di errore custom
│           └── run-migration.js     ← esegue file SQL da riga di comando
│
└── frontend/                        ← tutto il codice client (HTML/CSS/JS)
    ├── index.html                   ← pagina login / registrazione
    ├── dashboard.html               ← pagina principale dopo login
    │
    ├── css/
    │   ├── styles.css               ← stili condivisi (login, pulsanti, form)
    │   └── dashboard.css            ← stili esclusivi della dashboard
    │
    └── js/
        ├── login.js                 ← logica pagina login
        ├── dashboard.js             ← logica pagina dashboard (orchestratore)
        │
        ├── api/                     ← comunicazione con il backend
        │   ├── auth-api.js          ← register, login, token in localStorage
        │   └── match-api.js         ← invite, accept, leaderboard, history
        │
        └── ui/                      ← componenti di rendering DOM
            ├── invitation-ui.js     ← renderizza lista inviti
            ├── leaderboard-ui.js    ← renderizza tabella classifica
            └── match-history-ui.js  ← renderizza lista storico partite
```

---

## 🔍 SPIEGAZIONE DETTAGLIATA DI OGNI FILE

### 📌 ROOT
| File | Funzione |
|------|----------|
| `.gitignore` | Dice a Git di non tracciare `node_modules/`, file `.env`, cartelle OS |
| `README.md` | Documentazione: setup, API, schema DB, troubleshooting |

---

### 📌 BACKEND — Entry Point

#### `backend/src/server.js`
**Il cuore del backend.** Fa 5 cose:
1. Carica variabili d'ambiente (`dotenv.config()`)
2. Verifica che `JWT_SECRET` sia impostato (fail-fast → server non parte senza)
3. Attiva middleware globali (CORS, JSON parsing)
4. Registra tutte le routes (`/api/auth`, `/api/matches`, `/api/leaderboard`)
5. Mette l'error handler come **ultimo** middleware
6. Avvia il server sulla porta `PORT` (default 3000)

---

### 📌 BACKEND — Middleware

#### `backend/src/middleware/authenticate.js`
**Guardia JWT.** Applicato a ogni route protetta.
- Legge l'header `Authorization: Bearer <token>`
- Verifica il token con `jwt.verify()`
- Se valido → salva il payload (`{ id, username }`) in `req.user` e chiama `next()`
- Se non valido → lancia `AuthenticationError(401)`

#### `backend/src/middleware/error-handler.js`
**Centrale degli errori.** Riceve tutti gli errori da `next(error)`.
- Riconosce le classi custom (`ValidationError`, `AuthenticationError`, `NotFoundError`, `ConflictError`)
- Formatta sempre la risposta come `{ error: { message, code, status, details } }`
- Per errori sconosciuti risponde 500

---

### 📌 BACKEND — Utils

#### `backend/src/utils/db.js`
**Pool di connessioni MariaDB.**
- Crea un pool con max 10 connessioni simultanee
- Legge credenziali da variabili d'ambiente
- Tutti i modelli importano questo pool con `pool.getConnection()`

#### `backend/src/utils/errors.js`
**4 classi di errore custom**, tutte estendono `Error`:
| Classe | Status HTTP | Quando usarla |
|--------|-------------|---------------|
| `ValidationError` | 400 | Input non valido, autoInvito, invito scaduto |
| `AuthenticationError` | 401 | Token mancante/scaduto/invalido |
| `NotFoundError` | 404 | Utente o risorsa non trovata |
| `ConflictError` | 409 | Invito duplicato, username già esistente |

#### `backend/src/utils/run-migration.js`
**Esecutore di migrazioni SQL** da riga di comando.
- Legge il numero migrazione da `process.argv[2]` (es. `"002"`)
- Trova il file corrispondente in `database/migrations/`
- Esegue il file SQL sulla connessione con `multipleStatements: true`
- Uso: `npm run migrate:001`

---

### 📌 BACKEND — Models (Query SQL)

#### `backend/src/models/user-model.js`
**Gestione utenti nel database.**
| Funzione | Cosa fa |
|----------|---------|
| `createUser(username, password)` | Hash password con bcrypt, inserisce riga, ritorna `{ id, username, createdAt }` |
| `findByUsername(username)` | Cerca utente per username, ritorna row o `null` |
| `findById(userId)` | Cerca utente per ID (senza password hash) |
| `verifyPassword(plain, hash)` | Confronta password con bcrypt, ritorna `true/false` |

#### `backend/src/models/invitation-model.js`
**Gestione inviti — il file più complesso.**
| Funzione | Cosa fa |
|----------|---------|
| `expireOldInvitations(conn)` | UPDATE: mette `status='expired'` dove `expires_at < NOW()` |
| `createInvitation(inviterId, inviteeId)` | Controlla duplicati, inserisce con `expires_at = now + 3min` |
| `findActiveInvitationsByInvitee(inviteeId)` | Chiama expire → SELECT pending non scaduti → ordina per data |
| `findInvitationById(id, conn)` | Singolo invito per ID |
| `acceptInvitation(invitationId, inviteeId)` | Transazione: expire → valida → accetta → crea match |

**Pattern transazione usato ovunque:**
```js
await conn.beginTransaction()
try {
  // ... operazioni
  await conn.commit()
} catch {
  await conn.rollback()
  throw
}
```

#### `backend/src/models/match-model.js`
**Gestione partite.**
| Funzione | Cosa fa |
|----------|---------|
| `findMatchById(id, conn)` | Cerca partita per ID |
| `updateMatchStatus(id, status, winnerId, conn)` | Aggiorna status e opzionalmente winner |
| `completeMatch(id, winnerId, conn)` | Shortcut → `updateMatchStatus('completed', winnerId)` |
| `getMatchHistory(userId, limit, conn)` | JOIN complessa: match + users + scores per lo storico |

**La query `getMatchHistory`** usa:
- `CASE WHEN player1_id = ?` per determinare chi è l'avversario
- `LEFT JOIN scores` per prendere i punteggi (null se cancelled)
- Calcola `result` in JS confrontando `winner_id` con `userId`

#### `backend/src/models/score-model.js`
**Punteggi e leaderboard.**
| Funzione | Cosa fa |
|----------|---------|
| `getPlayerTotalScore(playerId, conn)` | `SUM(score_change)` per il giocatore, `0` se nessun record |
| `saveMatchResults(matchId, winnerId, loserId, conn)` | Calcola punteggi correnti, inserisce 2 record (+10 vincitore, -5 perdente) |
| `getLeaderboard(currentUserId)` | LEFT JOIN users+scores, GROUP BY, ordina, calcola rank con ties |

**Come funziona il rank con parità:**
```js
// Se il punteggio è uguale al precedente → stesso rank
// Se diverso → rank = posizione attuale (1-based)
if (previousScore !== null && row.total_score !== previousScore) {
  currentRank = i + 1
}
```

---

### 📌 BACKEND — Routes (Endpoint HTTP)

#### `backend/src/routes/auth.js`
| Endpoint | Input | Output | Note |
|----------|-------|--------|------|
| `POST /api/auth/register` | `{ username, password }` | `{ user, token }` 201 | Username unico, password min 8 chars |
| `POST /api/auth/login` | `{ username, password }` | `{ user, token }` 200 | Verifica bcrypt |

#### `backend/src/routes/matches.js`
| Endpoint | Input | Output | Note |
|----------|-------|--------|------|
| `POST /api/matches/invite` | `{ username }` | invitation 201 | Richiede JWT |
| `GET /api/matches/invites/active` | — | `[invitation]` 200 | Richiede JWT |
| `POST /api/matches/invites/:id/accept` | — | `{ invitation, match }` 200 | Richiede JWT |
| `GET /api/matches/history` | — | `[match]` 200 | Richiede JWT |
| `POST /api/matches/:id/forfeit` | — | `{ matchId, winnerId }` 200 | Richiede JWT |

#### `backend/src/routes/leaderboard.js`
| Endpoint | Output | Note |
|----------|--------|------|
| `GET /api/leaderboard` | `[{ rank, userId, username, totalScore }]` | Richiede JWT |

---

### 📌 FRONTEND — Pagine HTML

#### `frontend/index.html`
Pagina di login. Contiene:
- Form login (username + password)
- Form registrazione (nascosto di default)
- Link per passare da uno all'altro
- Carica `js/login.js` come modulo ES6

#### `frontend/dashboard.html`
Pagina principale. Contiene:
- Header con nome utente + logout
- Sezione invio inviti (form + lista)
- Sezione leaderboard (tabella)
- Sezione match history (lista)
- Carica `js/dashboard.js` come modulo ES6

---

### 📌 FRONTEND — JavaScript

#### `frontend/js/login.js`
**Orchestratore pagina login.**
- Controlla se già autenticato (redirect a dashboard)
- Gestisce switch login ↔ register
- Su submit login → chiama `auth-api.login()` → salva token → redirect
- Su submit register → chiama `auth-api.register()` → salva token → redirect

#### `frontend/js/dashboard.js`
**Orchestratore pagina dashboard.**
- Controlla autenticazione (redirect se non loggato)
- Gestisce logout (cancella token → redirect)
- Gestisce form invito
- Carica e aggiorna inviti, leaderboard, storico ogni 10 secondi
- Delega il rendering ai moduli `ui/`

#### `frontend/js/api/auth-api.js`
**Client API autenticazione.**
| Funzione | Cosa fa |
|----------|---------|
| `register(username, password)` | POST `/api/auth/register` |
| `login(username, password)` | POST `/api/auth/login` |
| `saveToken(token)` | Salva JWT in `localStorage` |
| `getToken()` | Legge JWT da `localStorage` |
| `removeToken()` | Cancella JWT da `localStorage` |
| `saveUser(user)` | Salva `{ id, username }` in `localStorage` |
| `getUser()` | Legge utente da `localStorage` |
| `logout()` | Cancella token + user da `localStorage` |

Usa internamente `fetchWithTimeout()` con timeout di 10 secondi.

#### `frontend/js/api/match-api.js`
**Client API partite/classifica.**
| Funzione | Cosa fa |
|----------|---------|
| `sendInvitation(username)` | POST `/api/matches/invite` |
| `getActiveInvitations()` | GET `/api/matches/invites/active` |
| `acceptInvitation(id)` | POST `/api/matches/invites/:id/accept` |
| `getLeaderboard()` | GET `/api/leaderboard` |
| `getMatchHistory()` | GET `/api/matches/history` |

Ogni chiamata usa `fetchWithAuth()` che aggiunge automaticamente `Authorization: Bearer <token>` e, se riceve 401, fa redirect al login.

#### `frontend/js/ui/invitation-ui.js`
**Rendering inviti.** 3 funzioni esportate:
- `renderInvitations(container, invitations)` → genera HTML lista inviti con countdown
- `showInvitationsLoading(container)` → mostra "Loading..."
- `showInvitationsError(container, message)` → mostra messaggio errore

#### `frontend/js/ui/leaderboard-ui.js`
**Rendering classifica.** 3 funzioni esportate:
- `renderLeaderboard(container, leaderboard, currentUserId)` → genera tabella HTML, evidenzia riga utente corrente
- `showLeaderboardLoading(container)`
- `showLeaderboardError(container, message)`

#### `frontend/js/ui/match-history-ui.js`
**Rendering storico.** 3 funzioni esportate + helper privati:
- `renderMatchHistory(container, history)` → genera lista con badge colorati
- `showMatchHistoryLoading(container)`
- `showMatchHistoryError(container, message)`
- `formatDate(isoString)` → `DD/MM/YYYY HH:MM` (privato)
- `getResultClass(result)` → `result-win` / `result-loss` / `result-cancelled` (privato)
- `getResultText(result)` → `Win` / `Loss` / `Cancelled` (privato)
- `formatScore(myScore, opponentScore, result)` → HTML con colori +/- (privato)

---

## 🚀 COME USARE GIT — PASSO PER PASSO

### Passo 1 — Scarica il progetto e inizializza Git

```bash
# Entra nella cartella del progetto
cd battle-with-friend

# Inizializza il repository Git locale
git init

# Controlla che sia tutto a posto
git status
```

### Passo 2 — Prima commit

```bash
# Aggiungi tutti i file all'area di staging
git add .

# Guarda cosa sta per essere committato
git status

# Crea la prima commit
git commit -m "feat: initial project structure following all .md story specs

- Story 1.1: Project structure (backend + frontend dirs)
- Story 1.2-1.6: User auth (register, login, JWT middleware)
- Story 2.1-2.6: Invitation system (create, list, accept, expiration)
- Story 4.1-4.6: Scores, leaderboard, match history"
```

### Passo 3 — Pubblica su GitHub

```bash
# 1. Vai su https://github.com/new e crea un repo chiamato "battle-with-friend"
#    (lascialo VUOTO — non aggiungere README, .gitignore o licenza)

# 2. Collega il tuo repo locale al remoto
git remote add origin https://github.com/TUO_USERNAME/battle-with-friend.git

# 3. Rinomina il branch principale
git branch -M main

# 4. Fai il push
git push -u origin main
```

### Passo 4 — Prima di iniziare a sviluppare (crea .env locale)

```bash
cd backend
cp .env.example .env
# Ora modifica .env con le tue credenziali database
# NOTA: .env è nel .gitignore, non verrà mai committato!
```

### Passo 5 — Installa dipendenze e fai le migrazioni

```bash
cd backend
npm install
npm run migrate:001
npm run migrate:002
npm run migrate:004
npm start
```

---

## 🔄 WORKFLOW GIT CONSIGLIATO

### Una feature alla volta su branch separato

```bash
# Crea un branch per una nuova feature
git checkout -b feature/websocket-game

# Lavora, poi aggiungi i file modificati
git add backend/src/websocket/
git add backend/src/game/

# Commit con messaggio descrittivo
git commit -m "feat: add websocket handler for real-time game"

# Pubblica il branch
git push origin feature/websocket-game

# Apri una Pull Request su GitHub, poi fai merge in main
```

### Messaggi di commit standard usati nel progetto

```
feat: nuova funzionalità
fix: correzione bug
docs: aggiornamento documentazione
test: aggiunta/modifica test
refactor: refactoring senza cambio funzionalità
chore: aggiornamento dipendenze, config
```

---

## ❓ DOMANDE FREQUENTI

### "Devo committare `node_modules/`?"
**No.** È nel `.gitignore`. Chiunque clona il repo esegue `npm install` e li ricrea.

### "Devo committare `.env`?"
**Mai.** Contiene password e chiavi segrete. Solo `.env.example` va su Git.

### "Come condivido le credenziali DB con il team?"
Tramite un canale sicuro (es. password manager condiviso), non su Git.

### "Posso avere più `.gitignore`?"
Sì. Il progetto ne ha due:
- `.gitignore` (radice) → regole generali
- `backend/.gitignore` → specifica per il backend (ignora `.env` locale)

### "Errore: `remote origin already exists`?"
```bash
git remote set-url origin https://github.com/TUO_USERNAME/battle-with-friend.git
```

### "Come clono il progetto su un altro computer?"
```bash
git clone https://github.com/TUO_USERNAME/battle-with-friend.git
cd battle-with-friend
cd backend
npm install
cp .env.example .env
# modifica .env con le credenziali
npm run migrate:001
npm run migrate:002
npm run migrate:004
npm start
```

---

## 📋 CHECKLIST PRE-COMMIT

Prima di ogni `git commit`, verifica:
- [ ] `.env` NON compare in `git status`
- [ ] `node_modules/` NON compare in `git status`
- [ ] Il backend parte: `npm start` senza errori
- [ ] I test passano: `npm test`
- [ ] Il messaggio di commit è descrittivo

---

## 🎯 RIEPILOGO FILE DA NON COMMITTARE MAI

| File/Cartella | Motivo |
|---------------|--------|
| `backend/.env` | Contiene password e JWT secret |
| `backend/node_modules/` | Troppo pesante, si rigenera con `npm install` |
| `backend/coverage/` | Generata dai test |
| `.DS_Store` | File nascosto macOS |
| `Thumbs.db` | File nascosto Windows |

Tutti questi sono già nel `.gitignore` del progetto ✅
