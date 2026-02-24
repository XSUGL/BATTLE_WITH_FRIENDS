-- Migration 002: Create invitations and matches tables
-- Story 2.1: Database Schema - Invitations and Matches Tables

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS invitations;

SET FOREIGN_KEY_CHECKS = 1;

-- Create invitations table
CREATE TABLE invitations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  inviter_id INT NOT NULL,
  invitee_id INT NOT NULL,
  status ENUM('pending', 'accepted', 'expired', 'cancelled') NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_invitations_invitee_status (invitee_id, status),
  INDEX idx_invitations_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create matches table
CREATE TABLE matches (
  id INT PRIMARY KEY AUTO_INCREMENT,
  player1_id INT NOT NULL,
  player2_id INT NOT NULL,
  status ENUM('pending', 'active', 'completed', 'cancelled') NOT NULL,
  winner_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (player1_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (player2_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_matches_status (status),
  INDEX idx_matches_player1 (player1_id),
  INDEX idx_matches_player2 (player2_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
