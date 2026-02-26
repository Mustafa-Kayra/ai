/*
  # Add composite unique constraint to chats table

  ## Summary
  The upsert in syncChatsToSupabase uses onConflict:'user_id,id' but there was
  no composite unique constraint on (user_id, id), causing every upsert to fail
  silently. This migration adds the constraint so upserts work correctly.

  ## Changes
  - Adds UNIQUE (user_id, id) constraint to chats table
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chats_user_id_chat_id_unique'
  ) THEN
    ALTER TABLE chats ADD CONSTRAINT chats_user_id_chat_id_unique UNIQUE (user_id, id);
  END IF;
END $$;
