CREATE TABLE IF NOT EXISTS idle_profiles (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  state_json JSON NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE idle_profiles ADD COLUMN IF NOT EXISTS character_name_key VARCHAR(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL UNIQUE;

CREATE TABLE IF NOT EXISTS idle_chat_messages (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  profile_id VARCHAR(80) NOT NULL,
  player_name VARCHAR(80) NOT NULL,
  message_text VARCHAR(240) NOT NULL,
  created_at_ms BIGINT UNSIGNED NOT NULL,
  CONSTRAINT idle_chat_profile FOREIGN KEY (profile_id) REFERENCES idle_profiles(id) ON DELETE CASCADE
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS idle_commands (
  profile_id VARCHAR(80) NOT NULL,
  request_id VARCHAR(64) NOT NULL,
  fingerprint VARCHAR(64) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (profile_id, request_id),
  CONSTRAINT idle_commands_profile FOREIGN KEY (profile_id) REFERENCES idle_profiles(id) ON DELETE CASCADE
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS idle_accounts (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  username VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  password_hash VARCHAR(512) NOT NULL,
  credential_version INT UNSIGNED NOT NULL DEFAULT 1,
  profile_id VARCHAR(80) NOT NULL,
  CONSTRAINT idle_accounts_username UNIQUE (username),
  CONSTRAINT idle_accounts_profile_unique UNIQUE (profile_id),
  CONSTRAINT idle_accounts_profile FOREIGN KEY (profile_id) REFERENCES idle_profiles(id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE idle_accounts ADD COLUMN IF NOT EXISTS created_at_ms BIGINT UNSIGNED NULL;

CREATE TABLE IF NOT EXISTS idle_sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  account_id VARCHAR(80) NOT NULL,
  credential_version INT UNSIGNED NOT NULL,
  created_at_ms BIGINT UNSIGNED NOT NULL,
  expires_at_ms BIGINT UNSIGNED NOT NULL,
  INDEX idle_sessions_expiry (expires_at_ms),
  CONSTRAINT idle_sessions_account FOREIGN KEY (account_id) REFERENCES idle_accounts(id) ON DELETE CASCADE
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
