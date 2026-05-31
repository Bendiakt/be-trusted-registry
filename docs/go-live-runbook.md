# MyDD — Runbook go-live (pas-à-pas opérateur)

> Guide d'exécution **détaillé** des 4 derniers verrous avant lancement
> commercial. Chaque étape est une action que **tu** réalises dans ton
> navigateur / tes dashboards (Stripe, Railway) — Claude ne peut pas y accéder
> (secrets, paiements). Coche au fur et à mesure.
>
> Pré-requis : accès admin **Stripe**, **Railway** (projet be-trusted-registry),
> le repo cloné en local avec Node 22, et le registrar DNS de `mydd.work`.
>
> Vue d'ensemble : §1 Stripe LIVE · §2 Variables d'env prod · §3 Validation
> juridique · §4 Confort (rollback, backup, uptime). Temps total ≈ une demi-journée.

---

## §1 — 🔴 Stripe en mode LIVE

But : passer des clés de test aux clés réelles et garantir que le webhook
signé fonctionne en prod. Le code est complet ; **seule la config diffère**.

### 1.1 Récupérer la clé secrète LIVE
1. Stripe Dashboard → en haut à droite, **désactiver « Test mode »** (bascule).
2. Developers → **API keys** → « Secret key » → **Reveal live key**.
3. Elle commence par `sk_live_…`. **Copie-la** (tu la colleras en §2).

### 1.2 Créer l'endpoint webhook LIVE
1. Toujours en mode LIVE : Developers → **Webhooks** → **Add endpoint**.
2. Endpoint URL : `https://api.mydd.work/api/payments/webhook`
3. **Select events** → ajoute exactement ces **6 events** (ceux que le code gère,
   `backend/routes/payments.js`) :
   - `checkout.session.completed`
   - `payment_intent.payment_failed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `charge.refunded`
   - `customer.subscription.deleted`
4. **Add endpoint**, puis ouvre l'endpoint créé → **Signing secret** → **Reveal**.
   Il commence par `whsec_…`. **Copie-le** (→ `STRIPE_WEBHOOK_SECRET` en §2).

### 1.3 Créer les Price IDs des abonnements PAC (mode LIVE)
> Seuls les abonnements PAC S2/S3 utilisent un Price fixe ; les autres paiements
> utilisent un `price_data` dynamique (rien à créer).
1. Products → **Add product** « PAC Supervision S2 » → prix récurrent (mensuel ou
   annuel selon ton offre) → **Save**. Copie le `price_…` → `STRIPE_PAC_S2_PRICE_ID`.
2. Idem « PAC Supervision S3 » → `price_…` → `STRIPE_PAC_S3_PRICE_ID`.

### 1.4 Vérifier que les 3 valeurs sont prêtes
- [ ] `STRIPE_SECRET_KEY` = `sk_live_…`
- [ ] `STRIPE_WEBHOOK_SECRET` = `whsec_…`
- [ ] `STRIPE_PAC_S2_PRICE_ID` + `STRIPE_PAC_S3_PRICE_ID` = `price_…`

### 1.5 Test bout-en-bout réel (après §2 déployé)
1. Connecte-toi sur `https://mydd.work` avec un compte entreprise de test.
2. Achète une certification avec une **vraie carte** (ou une carte de test live).
3. Vérifie dans Stripe → Payments que le paiement est **Succeeded**.
4. Stripe → Webhooks → ton endpoint → **Events** : `checkout.session.completed`
   doit afficher **HTTP 200**. (Sinon, voir Dépannage ci-dessous.)
5. Vérifie dans l'app : certification accordée + email reçu.
6. **Rembourse** depuis Stripe → Payments → … → **Refund**. Vérifie que l'event
   `charge.refunded` repasse en 200 et que l'app reflète le remboursement.

**Dépannage webhook** :
- 400 « signature » → `STRIPE_WEBHOOK_SECRET` ne correspond pas à l'endpoint LIVE.
- 404 → l'URL n'est pas exactement `/api/payments/webhook`.
- Le webhook est **exempté CSRF** et lit le **raw body** : ne mets aucun proxy
  qui réécrit le corps de la requête.

---

## §2 — 🔴 Variables d'environnement prod (Railway backend)

But : toutes les variables critiques présentes et au bon format. Un **vérificateur
automatique** existe : `npm run preflight` (n'affiche jamais les valeurs).

### 2.1 Saisir les variables
1. Railway → projet **be-trusted-registry** → service **backend** → onglet
   **Variables**.
2. Renseigne / vérifie (génère les secrets avec les commandes indiquées) :

| Variable | Valeur attendue | Comment l'obtenir |
|---|---|---|
| `NODE_ENV` | `production` | littéral |
| `DATABASE_URL` | `postgresql://…` | déjà fournie par Railway PG |
| `JWT_SECRET` | ≥ 32 chars aléatoires | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | ≥ 32 chars, **différent** de JWT_SECRET | idem (regénérer) |
| `ENCRYPTION_KEY` | **64 hex** (32 bytes) | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `STRIPE_SECRET_KEY` | `sk_live_…` | §1.1 |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | §1.2 |
| `STRIPE_PAC_S2_PRICE_ID` / `_S3_` | `price_…` | §1.3 |
| `RESEND_API_KEY` | `re_…` | resend.com → API Keys |
| `RESEND_FROM` | `MyDD <noreply@mydd.work>` | domaine vérifié dans Resend |
| `FRONTEND_URL` | `https://mydd.work` | littéral |
| `CORS_ORIGINS` | `https://mydd.work` | littéral (virgules si plusieurs) |
| `SENTRY_DSN` | `https://…@…ingest.sentry.io/…` | Sentry → project settings |
| `REDIS_URL` | `redis://…` | Railway Redis plugin |
| `METRICS_TOKEN` | chaîne aléatoire | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

> ⚠️ `SMOKE_TEST_SKIP_EMAIL_VERIFY` **ne doit PAS** valoir `true` en prod.

### 2.2 Vérifier automatiquement
Depuis le service backend (Railway → backend → **Shell/Console**) **ou** en local
avec les vars prod chargées :
```bash
cd backend && npm run preflight
```
- Exit `0` + « All critical checks passed » → 🟢 prêt.
- Exit `1` → corrige les lignes ❌ (le script dit exactement laquelle).

### 2.3 Redéployer
Après modification des variables, Railway redéploie automatiquement. Confirme :
```bash
curl -s https://api.mydd.work/api/health/ready
# attendu : {"ready":true,"db":"ok",...}
```

- [ ] `npm run preflight` → exit 0 en mode production
- [ ] `/api/health/ready` → `ready:true, db:ok`

---

## §3 — 🟡 Validation juridique CGU / RGPD

But : faire signer juridiquement les documents publiés. Tout le travail technique
est prêt — il reste l'avis d'un·e professionnel·le. Support : **`docs/compliance-rgpd.md`**.

### 3.1 Préparer le dossier pour l'avocat / DPO
1. Exporte les deux textes publiés : `https://mydd.work/terms` et `/privacy`.
2. Joins **`docs/compliance-rgpd.md`** (mapping droits RGPD → implémentation,
   registre sous-traitants, durées de conservation **déjà alignées** au code).
3. Joins la liste des 5 sous-traitants (Railway, Stripe, Resend, Cloudflare R2,
   Sentry — tous USA) pour vérification DPF/CCT.

### 3.2 Points à faire valider explicitement
- [ ] CGU : droit applicable UAE / **DIFC Courts** adapté à ta cible clients.
- [ ] Politique de confidentialité : bases légales du tableau §2 correctes.
- [ ] Conservation « jusqu'à 24 mois » des logs d'audit défendable (intérêt légitime).
- [ ] Transferts hors-UE : chaque sous-traitant couvert par **DPF** ou **CCT** signées.
- [ ] Mentions légales société (B&E Consult FZCO, Dubai) présentes et exactes.
- [ ] Délai de réponse RGPD annoncé (30 j) tenable opérationnellement (cf. `docs/support.md`).

### 3.3 Après validation
- [ ] Si l'avocat demande des changements de texte → modifier `frontend/src/pages/Legal.jsx`
      (et la date « Dernière mise à jour »), re-déployer.
- [ ] Archiver les DPA signés de chaque sous-traitant (dossier conformité).

---

## §4 — 🟢 Confort post-lancement (résilience)

But : pouvoir réagir vite en cas d'incident. Documenté ici à partir de
l'architecture réelle (Railway + migrations forward-only).

### 4.1 Procédure de rollback

**Contexte technique** :
- Déploiement : `backend/railway.toml` → `preDeployCommand = npm run migrate`
  puis `node server.js`, healthcheck `/api/health/ready`.
- Migrations : **forward-only**, idempotentes, transactionnelles par fichier,
  suivies dans la table `schema_migrations` (pas de « down-migration »).

**A. Rollback applicatif (code) — cas courant**
1. Railway → service backend → onglet **Deployments**.
2. Repère le dernier déploiement **sain** (vert) → **⋯ → Redeploy** (« Rollback »).
3. Attends le healthcheck `/api/health/ready` vert.
4. Vérifie : `curl -s https://api.mydd.work/api/health/ready`.

> Alternative par git : `git revert <sha_fautif>` → push sur `main` → Railway
> redéploie. Préférable si tu veux garder l'historique propre.

**B. Rollback avec migration impliquée — prudence**
- Comme il n'y a **pas de down-migrations**, un rollback de code sur une version
  antérieure au schéma n'annule PAS la migration DB. Deux cas :
  - Migration **additive** (nouvelle table/colonne nullable) → l'ancienne version
    du code fonctionne quand même : un simple rollback applicatif (A) suffit.
  - Migration **destructive** (drop/rename/NOT NULL) → un rollback applicatif peut
    casser. Il faut **restaurer la base** (voir 4.2) au point-in-time juste avant
    le déploiement, puis redéployer l'ancienne image.
- 🟢 Bonne pratique : garder les migrations **additives** et faire les suppressions
  en 2 temps (déprécier puis supprimer au déploiement suivant).
- 🛡️ **Garde-fou CI** : `npm run check:migrations` (lancé automatiquement en CI)
  **bloque** toute migration destructive (DROP/TRUNCATE/DELETE sans WHERE) non
  annotée. Pour une suppression délibérée et revue, ajouter en tête du fichier :
  `-- @destructive-ok: <raison>`.

### 4.2 Test de restauration de sauvegarde (à faire 1× avant go-live)
1. Railway → service **Postgres** → onglet **Backups** : vérifie que les backups
   automatiques (ou PITR) sont **activés**.
2. Crée une **base de staging** (ou un service PG jetable).
3. Restaure le dernier backup vers cette base de test.
4. Connecte-toi et vérifie l'intégrité :
   ```sql
   SELECT count(*) FROM users;
   SELECT count(*) FROM certifications;
   SELECT max(applied_at) FROM schema_migrations;
   ```
5. Note le **temps de restauration** (= ton RTO réel) dans ce runbook.
- [ ] Backups activés · [ ] restauration testée · [ ] RTO mesuré : ______

### 4.3 Uptime-checker externe
1. Crée un compte **UptimeRobot** (ou équivalent : Better Uptime, Railway metrics).
2. Ajoute 3 monitors HTTP(s), intervalle 1–5 min :
   - `https://api.mydd.work/api/health` (attendu : `status:ok`)
   - `https://api.mydd.work/api/health/ready` (attendu : `ready:true`)
   - `https://mydd.work` (frontend)
3. Configure l'alerte (email/SMS/Slack) vers le canal d'astreinte de `docs/support.md`.
- [ ] 3 monitors actifs · [ ] alertes routées

### 4.4 Domaine staging (parqué — P26)
- Optionnel : `api-staging.mydd.work` → CNAME vers le service Railway staging.
  Non bloquant pour le go-live prod.

---

## Récapitulatif Go / No-Go

| Verrou | Bloquant | Validé quand… |
|---|---|---|
| §1 Stripe LIVE + test réel | 🔴 | webhook 200 + cert accordée + refund OK |
| §2 Vars env prod | 🔴 | `npm run preflight` exit 0 + `/health/ready` ok |
| §3 Validation juridique | 🟡 | avis signé avocat/DPO |
| §4 Rollback / backup / uptime | 🟢 | restauration testée + monitors actifs |

**Une fois §1 et §2 cochés, le go-live est techniquement possible.** §3 peut se
mener en parallèle ; §4 idéalement avant, sinon juste après un soft-launch à
audience limitée.

---

*Documents liés : `docs/go-live-checklist.md` (vue synthétique),
`docs/compliance-rgpd.md` (RGPD), `docs/support.md` (support/SLA),
`backend/scripts/preflight-env.js` (`npm run preflight`).*
