-- صدى · ما يُحمَل من القاعدة الحيّة إلى ما يُسترجَع (docs/RUNBOOK.md §٢ و§٣) — يقرؤه scripts/restore_drill.mjs --carry
SELECT 'manifest' AS carry,
       (SELECT count(*) FROM posts WHERE status = 'published') AS posts,
       (SELECT count(*) FROM publish_attempts WHERE status IN ('succeeded', 'sent')) AS publish_attempts,
       (SELECT count(*) FROM cost_ledger) AS cost_ledger,
       (SELECT count(*) FROM members) AS members,
       (SELECT count(*) FROM passkeys) AS passkeys,
       (SELECT count(*) FROM recovery_codes) AS recovery_codes,
       (SELECT count(*) FROM totp) AS totp,
       (SELECT count(*) FROM member_totp) AS member_totp;
SELECT 'posts' AS carry, id, account_id, scheduled_at, approved_at, dispatched_at FROM posts WHERE status = 'published';
SELECT 'publish_attempts' AS carry, id, post_id, idempotency_key, attempt_no, request_json, response_json, platform_post_id, status, at, org_id, queue_attempt
  FROM publish_attempts WHERE status IN ('succeeded', 'sent');
SELECT 'cost_ledger' AS carry, id, provider, operation, units, unit_cost, total, currency, ref_id, at, org_id FROM cost_ledger;
SELECT 'members' AS carry, email, role, orgs, invited_by, created_at, last_seen_at, revoked_at FROM members;
SELECT 'passkeys' AS carry, id, credential_id, public_key, alg, sign_count, label, created_at, last_used_at, rp_id, email FROM passkeys;
SELECT 'recovery_codes' AS carry, hash, created_at, used_at, email FROM recovery_codes;
SELECT 'totp' AS carry, id, secret_cipher, secret_iv, confirmed_at, last_step, created_at FROM totp;
SELECT 'member_totp' AS carry, email, secret_cipher, secret_iv, confirmed_at, last_step, created_at FROM member_totp;
