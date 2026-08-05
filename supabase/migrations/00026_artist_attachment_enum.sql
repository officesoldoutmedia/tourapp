-- Fișiere permanente per artist (§3.2 Zola): parent nou pentru attachments.
-- Separat de 00027: valoarea de enum nu poate fi folosită în aceeași
-- tranzacție în care e adăugată.
alter type public.attachment_parent add value if not exists 'artist';
