# `scripts/` — index des outils Ops

Index des scripts d'exploitation (backup, restauration, monitoring, validation
de déploiement, DR, Stripe). Beaucoup attendent des variables d'environnement
(`DATABASE_URL` / `DATABASE_PUBLIC_URL`, `BACKEND_URL`, `STRIPE_SECRET_KEY`, …).

> Runbooks détaillés à la racine : **`DR_RUNBOOK.md`** (reprise après sinistre),
> **`DB_OPERATIONS.md`** (opérations base), **`MIGRATION_STRATEGY.md`** (migrations).
> Lancement commercial : **`docs/go-live-runbook.md`**.

---

## 💾 Sauvegarde & restauration base

| Script | Rôle |
|---|---|
| `db-backup.sh` | `pg_dump` de la base prod vers un fichier `.dump` horodaté. |
| `db-restore.sh <fichier.dump>` | Restaure un dump dans une base cible. **Destructif** sur la cible. |
| `db-restore-dry-run.sh` | **Drill de restauration** : restaure le dernier dump dans une base **temporaire** et vérifie l'intégrité (counts, migrations). Non destructif — idéal pour mesurer le RTO avant go-live. |
| `db-audit-cycle.sh` | Cycle complet backup → restore → audit (enchaîne les 3). |
| `db-audit-and-alert.sh` | Audit base + alerte (Slack/ntfy) si anomalie. |
| `db-smoke.js` | Vérifications applicatives rapides sur la base. |
| `persistence-proof.js <init\|verify>` | Prouve la persistance des données entre deux déploiements (écrit puis re-vérifie). |
| `install-backup-cron.sh` / `install-backup-launchagent.sh` | Installe la sauvegarde quotidienne automatique (cron Linux / LaunchAgent macOS). |
| `run-backup-launchagent-now.sh` | Déclenche une sauvegarde immédiate via le LaunchAgent. |

## 📡 Monitoring & alerting

| Script | Rôle |
|---|---|
| `monitor-prod.sh` | Sonde `/api/health` + `/api/health/ready` de la prod. |
| `monitor-and-alert.sh` | Monitoring + push (ntfy.sh, zéro setup). |
| `activate-slack-alerting.sh '<webhook>'` | Active l'alerting Slack (teste le webhook puis installe les LaunchAgents). |
| `install-monitor-cron.sh` / `install-monitor-launchagent.sh` | Installe le monitoring périodique (cron / LaunchAgent). |
| `install-audit-launchagent.sh` / `run-audit-launchagent-now.sh` | Installe / déclenche l'audit base périodique. |
| `ops-daily-report.sh` | Rapport quotidien d'exploitation (synthèse). |

## 🚀 Déploiement, DR & charge

| Script | Rôle |
|---|---|
| `deploy-validate.js [--env prod\|staging]` | Orchestrateur de validation **post-déploiement** (santé, DNS, Stripe, email). |
| `dr-validate.sh` | Séquence **reprise après sinistre** : baseline monitor → cycle backup/restore → dry-run failover → vérif des runbooks. |
| `auto-failover.sh` | Logique de bascule automatique (supporte `DRY_RUN=1`). |
| `load-test.js` | Test de charge pur Node.js (zéro dépendance). |
| `smoke-prod.js` | Smoke test des endpoints prod (`BACKEND_URL=…`). |
| `smoke-test-railway.sh` | Smoke test post-déploiement Railway (santé, auth, …). |
| `railway-cli.sh` | Wrapper Railway CLI *secure-by-default* pour ce repo. |
| `verify-health.js` | Vérifie que tous les services sont opérationnels. |
| `verify-dns.js` | Vérifie la configuration DNS de `mydd.work`. |

## 💳 Stripe & configuration

| Script | Rôle |
|---|---|
| `verify-stripe.js` | Vérifie la configuration Stripe **avant go-live**. |
| `stripe-live-validate.sh` | Validation du mode LIVE (clés, webhook). |
| `configure-stripe-portal.js` | Configure le Stripe Customer Portal. |
| `setup-stripe-test.js` | Crée les produits/prix de test. |
| `configure-pac-memberships.js` | Configure les produits d'abonnement PAC (idempotent). |
| `verify-email.js` | Teste l'envoi d'email via Resend. |

---

## Backend (`backend/scripts/`)

| Script | Commande | Rôle |
|---|---|---|
| `migrate.js` | `npm run migrate` | Applique les migrations `NNN_*.sql` (forward-only, idempotentes). |
| `check-migrations.js` | `npm run check:migrations` | **Garde-fou** : bloque les migrations destructives non annotées (CI). |
| `preflight-env.js` | `npm run preflight` | Vérifie présence + format des variables d'env prod (sans afficher les valeurs). |
| `seed-staging.js` | `npm run seed:staging` | Peuple la base de staging. |
| `stripe-test-clock.js` | — | Utilitaire d'horloge de test Stripe (abonnements). |

---

*Astuce : pour un drill de restauration sûr avant le lancement, exécuter
`scripts/db-restore-dry-run.sh` (base temporaire, non destructif) et noter le
temps de restauration = RTO réel.*
