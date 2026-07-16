-- Re-hash the superuser password with a 1-iteration SCRAM verifier.
--
-- `command: postgres -c scram_iterations=1` (compose.yaml) only governs the
-- RUNNING server; initdb already hashed POSTGRES_PASSWORD at the 4096-iteration
-- default before this script runs, and the proxy pays that PBKDF2 cost on every
-- request. Re-setting the password re-derives the stored verifier under the
-- session GUC below, which is what actually makes local auth free.
--
-- Throwaway loopback container only — see the compose.yaml comment.
SET scram_iterations = 1;
ALTER USER postgres WITH PASSWORD 'postgres';
