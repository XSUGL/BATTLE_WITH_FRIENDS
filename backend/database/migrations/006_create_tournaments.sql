-- Migration 006: Tournaments (single-elimination, 2/4/8/16/32 player brackets)
--
-- DA ESEGUIRE UNA VOLTA sul DB di Marconi (via SSH):
--   mysql -u <user> -p <db_name> < 006_create_tournaments.sql
--
-- Idempotente: usa CREATE TABLE IF NOT EXISTS e una stored procedure che
-- aggiunge le colonne/indici/FK su `matches` solo se mancano. Sicuro su
-- rerun parziali. NON distrugge i tornei già esistenti.

-- Anagrafica torneo
CREATE TABLE IF NOT EXISTS tournaments (
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
CREATE TABLE IF NOT EXISTS tournament_participants (
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
-- Idempotente via stored procedure (MySQL non supporta ADD COLUMN IF NOT EXISTS prima di 8.0.29).
DELIMITER //

DROP PROCEDURE IF EXISTS _migration_006_matches //
CREATE PROCEDURE _migration_006_matches()
BEGIN
  DECLARE has_it INT DEFAULT 0;

  SELECT COUNT(*) INTO has_it FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'tournament_id';
  IF has_it = 0 THEN
    ALTER TABLE matches ADD COLUMN tournament_id INT NULL AFTER status;
  END IF;

  SELECT COUNT(*) INTO has_it FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'round';
  IF has_it = 0 THEN
    ALTER TABLE matches ADD COLUMN round INT NULL AFTER tournament_id;
  END IF;

  SELECT COUNT(*) INTO has_it FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'bracket_slot';
  IF has_it = 0 THEN
    ALTER TABLE matches ADD COLUMN bracket_slot INT NULL
      COMMENT 'indice match nel round, 0-based' AFTER round;
  END IF;

  SELECT COUNT(*) INTO has_it FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND INDEX_NAME = 'idx_matches_tournament';
  IF has_it = 0 THEN
    ALTER TABLE matches ADD INDEX idx_matches_tournament (tournament_id, round);
  END IF;

  SELECT COUNT(*) INTO has_it FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches'
      AND CONSTRAINT_NAME = 'fk_matches_tournament' AND CONSTRAINT_TYPE = 'FOREIGN KEY';
  IF has_it = 0 THEN
    ALTER TABLE matches ADD CONSTRAINT fk_matches_tournament
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL;
  END IF;
END //

DELIMITER ;

CALL _migration_006_matches();
DROP PROCEDURE IF EXISTS _migration_006_matches;
