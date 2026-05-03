-- Seed user (email/password login). Password: 12345678 (bcrypt via Python bcrypt).
INSERT INTO public.users (user_id, email, name, picture, password_hash, auth_provider, subscription, created_at)
SELECT
  'user_seed_fareed',
  'fareed2004@gmail.com',
  'Fareed',
  NULL,
  '$2b$12$dedQNJd25ZyLZX66/svGFeWYeDh6awrk51f.Ths6H.K6GHVrVE4h6',
  'email',
  'free',
  now()
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE lower(u.email) = lower('fareed2004@gmail.com'));
