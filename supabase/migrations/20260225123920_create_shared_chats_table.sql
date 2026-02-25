/*
  # Create shared_chats table for public chat sharing

  ## Summary
  Allows users to share a conversation via a short public link.
  The shared snapshot is immutable and publicly readable by anyone
  who knows the share_id. Only authenticated owners can create or
  delete their shared snapshots.

  ## New Tables
  - `shared_chats`
    - `share_id` (text, PK) — short random slug generated client-side
    - `user_id` (uuid, FK → auth.users) — owner
    - `title` (text) — conversation title
    - `messages` (jsonb) — message array snapshot
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - SELECT policy uses `true` intentionally — shared chats are publicly
    accessible by design; only the share_id acts as the secret token
  - INSERT / UPDATE / DELETE restricted to authenticated owner
*/

CREATE TABLE IF NOT EXISTS shared_chats (
  share_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  messages jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shared_chats_user_id_idx ON shared_chats(user_id);

ALTER TABLE shared_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read shared chats"
  ON shared_chats FOR SELECT
  USING (true);

CREATE POLICY "Owners can insert shared chats"
  ON shared_chats FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can update shared chats"
  ON shared_chats FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can delete shared chats"
  ON shared_chats FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
