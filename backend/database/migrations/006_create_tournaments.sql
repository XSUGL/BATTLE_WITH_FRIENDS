-- Migration 006: Tournaments (single-elimination, 2/4/8/16/32 player brackets)
--
-- DA ESEGUIRE UNA VOLTA sul DB di Marconi (via SSH):
--   mysql -u <user> -p <db_name> < 006_create_tournaments.sql
--
-- Sicuro su DB esistenti: nessun DROP TABLE, ALTER non-distruttivi (ADD COLUMN
-- con default NULL su `matches`).

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS tournament_participants;
DROP TABLE IF EXISTS tournaments;
SET FOREIGN_KEY_CHECKS = 1;

-- Anagrafica torneo
CREATE TABLE tournaments (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  name          VARCHAR(80) NOT NULL,
  size          TINYINT NOT NULL COMMENT '2, 4, 8, 16, 32',
  creator_id    INT NOT NULL,
  status        ENUM('lobby','running','completed','cancelled') NOT NULL DEFAULT 'lobby',
  winner_id     INT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at    TIMESTAMP NULL,
  completed_at  TIMESTAMP NULL,
  FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (winner_id)  REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_tournaments_status (status),
  INDEX idx_tournaments_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Iscritti al torneo
CREATE TABLE tournament_participants (
  tournament_id   INT NOT NULL,
  user_id         INT NOT NULL,
  seed            INT NULL COMMENT 'posizione nel bracket (1..size) assegnata allo start',
  eliminated_at   INT NULL COMMENT 'round in cui è stato eliminato (1=primo turno); NULL = ancora in gara',
  joined_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tournament_id, user_id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE,
  INDEX idx_participants_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Aggiunta non-distruttiva a matches: NULL = match 1v1 normale (comportamento attuale).
-- Solo i match di torneo hanno tournament_id/round/bracket_slot valorizzati.
ALTER TABLE matches
  ADD COLUMN tournament_id INT NULL AFTER status,
  ADD COLUMN round         INT NULL AFTER tournament_id,
  ADD COLUMN bracket_slot  INT NULL COMMENT 'indice match nel round, 0-based' AFTER round,
  ADD INDEX idx_matches_tournament (tournament_id, round),
  ADD CONSTRAINT fk_matches_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL;
