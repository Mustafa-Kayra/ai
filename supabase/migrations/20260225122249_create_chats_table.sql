/*
  # Create chats table for cloud sync

  ## Summary
  Stores all user conversations in Supabase so they persist across devices
  and sessions. When a user logs in, their chats load from this table.
  When they log out, chats are cleared from the UI (but remain in the cloud).

  ## New Tables
  - `chats`
    - `id` (bigint, PK) — client-generated timestamp-based ID
    - `user_id` (uuid, FK → auth.users) — owner
    - `title` (text) — chat title
    - `messages` (jsonb) — array of message objects
    - `pinned` (boolean) — whether chat is pinned
    - `folder` (text, nullable) — folder name
    - `canvas` (jsonb, nullable) — canvas files
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  ## Security
  - RLS enabled
  - Users can only access their own chats
*/

CREATE TABLE IF NOT EXISTS chats (
  id bigint PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  messages jsonb NOT NULL DEFAULT '[]',
  pinned boolean NOT NULL DEFAULT false,
  folder text,
  canvas jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chats_user_id_idx ON chats(user_id);
CREATE INDEX IF NOT EXISTS chats_updated_at_idx ON chats(user_id, updated_at DESC);

ALTER TABLE chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own chats"
  ON chats FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chats"
  ON chats FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chats"
  ON chats FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own chats"
  ON chats FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
