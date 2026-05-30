# MyDD — Checklist de lancement commercial (Go-Live)

> État au 31 mai 2026 — Audit : 8,7/10, **soft-launch ready**.
> Aucun blocage technique. Cette checklist couvre les derniers verrous
> opérationnels/business à lever avant d'ouvrir aux clients payants.

Légende : 🔴 bloquant · 🟡 important · 🟢 confort post-lancement

---

## 1. 🔴 Paiements Stripe (verrou n°1)

Le code est complet et vérifie la signature webhook (`constructEvent`).
Le risque n'est pas le code — c'est la **configuration prod**.

- [ ] **Clé en mode LIVE** : `STRIPE_SECRET_KEY` en prod commence par `sk_live_`
      (et NON `sk_test_`). Vérifier dans Railway → service backend → Variables.
- [ ] **Webhook secret** : `STRIPE_WEBHOOK_SECRET` (`whsec_…`) configuré en prod,
      pointant vers `https://api.mydd.work/api/payments/webhook`.
- [ ] **Endpoint webhook déclaré** dans le dashboard Stripe (mode live) avec les
      6 events réellement gérés par le code :
  - `checkout.session.completed`
  - `payment_intent.payment_failed`
  - `invoice.payment_failed`
  - `invoice.paid`
  - `charge.refunded`
  - `customer.subscription.deleted`
- [ ] **Price IDs abonnements PAC** créés en mode live et renseignés :
  - `STRIPE_PAC_S2_PRICE_ID`
  - `STRIPE_PAC_S3_PRICE_ID`
  - (les autres paiements utilisent `price_data` dynamique — rien à configurer)
- [ ] **Test bout-en-bout réel** : 1 vraie transaction (carte réelle ou test live),
      vérifier réception webhook + certification accordée + email envoyé, puis
      **rembourser** depuis le dashboard et vérifier le traitement `charge.refunded`.

---

## 2. 🔴 Variables d'environnement prod (audit complet)

Confirmer que TOUTES sont définies en prod (Railway backend) :

**Critiques :**
- [ ] `DATABASE_URL` ✅ (vérifié : DB connectée)
- [ ] `JWT_SECRET` et `JWT_REFRESH_SECRET` (secrets forts, distincts, ≥ 32 chars)
- [ ] `ENCRYPTION_KEY` (chiffrement des données sensibles)
- [ ] `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (voir §1)
- [ ] `RESEND_API_KEY` + `RESEND_FROM` (emails transactionnels)

**Importantes :**
- [ ] `CORS_ORIGINS` / `FRONTEND_URL` → `https://mydd.work`
- [ ] `SENTRY_DSN` (monitoring erreurs)
- [ ] `REDIS_URL` (rate-limiting distribué / cache)
- [ ] `NODE_ENV=production`
- [ ] `METRICS_SECRET` / `METRICS_TOKEN` (protection endpoint /metrics)

---

## 3. 🟡 Sécurité des dépendances

- [ ] Backend : `cd backend && npm audit fix` (3 modérées : express→qs)
- [ ] Frontend : `cd frontend && npm audit` — 2 modérées (vite→esbuild,
      **dev-only**, non exposées en prod). Patcher au prochain bump Vite.
- [ ] Re-lancer la suite de tests après patch (backend + frontend + e2e).

---

## 4. 🟡 Conformité légale & RGPD

- [ ] CGU et Politique de confidentialité (`Legal.jsx`) **validées juridiquement**.
- [ ] Vérifier les flux RGPD existants : export de données + droit à l'effacement
      (déjà implémentés dans `auth.js`).
- [ ] Bandeau cookies opérationnel (`CookieBanner.jsx` — déjà en place).
- [ ] Mentions légales société (B&E Consult FZCO, Dubai) à jour sur le site.
- [ ] DPA / sous-traitants (Stripe, Resend, Railway, Sentry) listés.

---

## 5. 🟡 Observabilité & support

- [ ] **Alerting** branché sur Sentry (Slack/email/PagerDuty) pour être notifié
      des erreurs prod en temps réel.
- [ ] Vérifier `/api/health`, `/api/health/live`, `/api/health/ready` monitorés
      par un uptime-checker externe (UptimeRobot / Railway).
- [ ] Canal de support client défini (email support@ + délai de réponse SLA).
- [ ] Dashboard métier (`/metrics` business) accessible à l'équipe.

---

## 6. 🟢 Confort post-lancement

- [ ] P26 : domaine custom `api-staging.mydd.work` (DNS/Railway) — parqué.
- [ ] Sauvegarde DB automatisée vérifiée (Railway backups + test de restauration).
- [ ] Procédure de rollback documentée (revert + redéploiement).
- [ ] Plan de montée en charge (PG_POOL_MAX, Redis) si pic d'inscriptions.

---

## Récapitulatif — Go / No-Go

| Catégorie | Bloquant ? | Effort estimé |
|---|---|---|
| §1 Stripe live + test réel | 🔴 Oui | ~2-3 h |
| §2 Vars env prod | 🔴 Oui | ~1 h |
| §3 npm audit fix | 🟡 Recommandé | ~30 min |
| §4 Validation juridique | 🟡 Recommandé | externe |
| §5 Alerting/support | 🟡 Recommandé | ~1 h |
| §6 Confort | 🟢 Non | post-launch |

**Verdict :** une fois §1 et §2 cochés (≈ une demi-journée), le **go-live est
possible**. Les §3-§5 peuvent se faire en parallèle ou juste après un soft-launch
à audience limitée.
