# MyDD — Pack de revue de conformité RGPD

> But : donner à un·e juriste / DPO externe une **cartographie vérifiable** entre
> chaque obligation RGPD et son implémentation technique réelle, et **signaler
> les écarts** entre la politique publiée (`frontend/src/pages/Legal.jsx`) et le
> code. À utiliser comme support de la « validation juridique » (checklist §4).
>
> État au 31 mai 2026 · Responsable de traitement : B&E Consult FZCO (Dubai).

Légende statut : ✅ implémenté & vérifié · ⚠️ écart à arbitrer · ◻️ action externe (juriste)

---

## 1. Droits des personnes concernées — mapping technique

| Droit (RGPD) | Implémentation | Emplacement | Statut |
|---|---|---|---|
| Accès (Art. 15) | Export JSON complet des données détenues | `GET /api/auth/me/export` — `backend/routes/auth.js:539` | ✅ |
| Portabilité (Art. 20) | Même export, format JSON structuré, téléchargeable | idem (Content-Disposition attachment) | ✅ |
| Rectification (Art. 16) | Mise à jour nom / mot de passe ; données société via espace entreprise | `PATCH /api/auth/profile` — `auth.js:463` | ✅ |
| Effacement (Art. 17) | Anonymisation PII (email → `*@deleted.invalid`, nom, mot de passe), purge des tokens, détachement société. Confirmation par mot de passe requise. | `DELETE /api/auth/me` — `auth.js:576` | ✅ |
| Limitation (Art. 18) | Pas de flux self-service dédié — traité manuellement via `privacy@mydd.work` | — | ◻️ |
| Opposition (Art. 21) | Idem — traité manuellement via `privacy@mydd.work` | — | ◻️ |

**Garanties techniques de l'export** : rate-limité (5 requêtes/heure), journalisé
(`AUDIT.USER_DATA_EXPORT`), n'inclut **jamais** le hash des clés API ni les mots
de passe.

**Garanties de l'effacement** : soft-delete qui **préserve l'intégrité de
l'audit log** (exigence sécurité/anti-fraude) tout en anonymisant les PII —
approche conforme à l'équilibre Art. 17 §3 (conservation pour obligations légales).

---

## 2. ✅ Écarts politique ↔ implémentation — RÉSOLUS

Trois incohérences avaient été détectées entre la politique publiée
(`Legal.jsx` §5) et le comportement réel. **Toutes alignées** (P40/P41) :

### Écart n°1 — Logs d'audit ✅ politique alignée sur le code
- **Avant** : politique « 12 mois » vs code défaut **730 j (2 ans)**, purge
  limitée aux comptes anonymisés (actifs conservés — design anti-fraude voulu).
- **Décision** : le design du code est le bon (la conservation longue sert la
  lutte anti-fraude, base légale = intérêt légitime). La politique est corrigée
  pour refléter la réalité : « **Jusqu'à 24 mois (intérêt légitime — sécurité /
  lutte anti-fraude)** ». `Legal.jsx` §5 mis à jour.

### Écart n°2 — Notifications ✅ code aligné sur la politique
- **Avant** : politique « 90 j archivage auto » vs **aucun cron** (suppression
  manuelle uniquement).
- **Décision** : ajout d'une purge automatique au cron PII —
  `DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '90 days'`,
  configurable via `RETENTION_NOTIFICATIONS_DAYS` (défaut 90).
  `backend/lib/cronJobs.js` (runPiiRetention, étape 3).

### Écart n°3 — Fermeture de compte ✅ politique corrigée
- **Avant** : politique « 30 jours (anonymisation automatique) ». **Réalité** :
  l'effacement anonymise **immédiatement** à la demande (Art. 17).
- **Décision** : politique reformulée → « **Anonymisation immédiate à la demande
  (droit à l'effacement)** ». `Legal.jsx` §5.

---

## 3. Sous-traitants (Art. 28) — registre & DPA

| Sous-traitant | Pays | Finalité | DPA à archiver |
|---|---|---|---|
| Railway Inc. | USA | Hébergement serveur + base PostgreSQL | ◻️ |
| Stripe Inc. | USA | Traitement des paiements (aucune CB stockée chez nous) | ◻️ |
| Resend Inc. | USA | Emails transactionnels | ◻️ |
| Cloudflare R2 | USA | Stockage des documents uploadés | ◻️ |
| Sentry Inc. | USA | Monitoring des erreurs (données techniques uniquement) | ◻️ |

- Liste **cohérente** avec `Legal.jsx` §4. ✅
- Transferts hors UE encadrés par DPF EU-US / CCT — **à confirmer** par le juriste
  que chaque sous-traitant est bien certifié DPF ou couvert par des CCT signées. ◻️
- **Action** : archiver une copie signée du DPA de chacun (dossier conformité).

---

## 4. Sécurité des données (Art. 32) — mesures déclarées vs réelles

| Mesure (Legal.jsx §7) | Vérifiée dans le code | Statut |
|---|---|---|
| Hash mots de passe bcrypt | `lib/auth.js` / register/login | ✅ |
| JWT courts (15 min) + rotation refresh | `lib/auth.js`, `refresh_tokens` | ✅ |
| HTTPS only / HSTS | headers helmet-équivalents `server.js` | ✅ |
| Détection de fraude | `lib/fraudDetection.js` (7 règles) | ✅ |
| Journalisation des accès (audit log) | `audit_log` + `logAudit` | ✅ |
| Sauvegardes Railway (PITR) | infra Railway | ◻️ (vérifier restauration) |
| Chiffrement données sensibles | `lib/encryption.js` (`ENCRYPTION_KEY` 64-hex) | ✅ |

---

## 5. Checklist pour la revue juridique externe

- [x] ~~Arbitrer les écarts du §2~~ — résolus (politique alignée + cron notifs 90 j).
- [ ] Valider le texte des CGU (`Legal.jsx` onglet CGU) — droit applicable UAE / DIFC Courts.
- [ ] Valider la Politique de confidentialité (onglet Privacy) après correction du §2.
- [ ] Confirmer la base légale de chaque traitement (tableau Privacy §2).
- [ ] Confirmer DPF/CCT pour les 5 sous-traitants et archiver les DPA (§3).
- [ ] Mentions légales société (B&E Consult FZCO, Dubai) à jour sur le site.
- [ ] Désignation DPO / point de contact `privacy@mydd.work` opérationnel (cf. `docs/support.md`).
- [ ] Vérifier le délai de réponse RGPD annoncé (30 jours) tenable opérationnellement.

---

*Ce document est un support technique de conformité. Il ne constitue pas un avis
juridique : la validation finale relève d'un·e juriste / DPO.*
