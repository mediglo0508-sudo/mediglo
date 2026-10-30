
CREATE TABLE IF NOT EXISTS public.cos_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cos_branches TO authenticated;
GRANT ALL ON public.cos_branches TO service_role;
ALTER TABLE public.cos_branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cos_branches_read ON public.cos_branches;
CREATE POLICY cos_branches_read ON public.cos_branches FOR SELECT TO authenticated USING (true);
INSERT INTO public.cos_branches (code, name, is_primary)
VALUES ('MAIN', 'Main Branch', true)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.cos_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_lookup ON public.cos_chat_messages (sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_chat_receiver ON public.cos_chat_messages (receiver_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.cos_chat_messages TO authenticated;
GRANT ALL ON public.cos_chat_messages TO service_role;
ALTER TABLE public.cos_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cos_chat_read ON public.cos_chat_messages;
CREATE POLICY cos_chat_read ON public.cos_chat_messages FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
DROP POLICY IF EXISTS cos_chat_insert ON public.cos_chat_messages;
CREATE POLICY cos_chat_insert ON public.cos_chat_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);
DROP POLICY IF EXISTS cos_chat_update ON public.cos_chat_messages;
CREATE POLICY cos_chat_update ON public.cos_chat_messages FOR UPDATE TO authenticated
  USING (auth.uid() = receiver_id) WITH CHECK (auth.uid() = receiver_id);

DO $$ BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.cos_chat_messages';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
