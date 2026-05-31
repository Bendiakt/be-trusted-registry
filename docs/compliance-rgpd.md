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

## 2. ⚠️ Écarts politique publiée ↔ implémentation (à arbitrer)

La politique de confidentialité (`Legal.jsx`, §5 « Durée de conservation »)
contient deux engagements qui **ne correspondent pas** au comportement réel du
système. Un engagement public doit refléter la réalité, sinon il crée un risque
juridique. **Décision requise** : aligner le texte sur le code, ou le code sur le
texte.

### Écart n°1 — Logs d'audit
- **Politique publiée** : « Logs de connexion et audit → **12 mois** ».
- **Réalité (code)** : `RETENTION_AUDIT_LOG_DAYS` défaut **730 jours (2 ans)**, et
  la purge ne s'applique qu'aux **comptes anonymisés** ; pour un compte actif,
  l'audit log est conservé sans limite de durée.
  `backend/lib/cronJobs.js:149,155-170`.
- **Options** :
  - (a) Aligner le code → mettre `RETENTION_AUDIT_LOG_DAYS=365` en prod (12 mois)
    et étendre la purge aux comptes actifs.
  - (b) Aligner la politique → annoncer « jusqu'à 24 mois (intérêt légitime
    sécurité) » et préciser la conservation au-delà pour comptes actifs.

### Écart n°2 — Notifications
- **Politique publiée** : « Notifications → **90 jours (archivage automatique)** ».
- **Réalité (code)** : **aucun** cron de purge à 90 jours. Les notifications ne
  sont supprimées que **manuellement** par l'utilisateur
  (`DELETE /api/notifications/:id` et purge des lues — `routes/notifications.js:104,121`).
- **Options** :
  - (a) Aligner le code → ajouter au cron PII un `DELETE FROM notifications WHERE
    created_at < NOW() - INTERVAL '90 days'`.
  - (b) Aligner la politique → retirer la mention « archivage automatique » et
    décrire la suppression manuelle.

### À vérifier — Fermeture de compte
- **Politique** : « Données après fermeture du compte → 30 jours (anonymisation
  automatique) ». **Réalité** : l'effacement anonymise **immédiatement** à la
  demande de l'utilisateur (pas de délai de 30 jours). Soit la mention vise un
  autre flux (comptes inactifs ?), soit elle doit être reformulée.

> 💡 Une fois la décision prise, le choix (a) est un changement de code testable ;
> le choix (b) est une simple édition de `Legal.jsx`. Voir aussi la vérification
> automatique d'env `npm run preflight` (rien à configurer ici, juste les vars).

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

- [ ] **Arbitrer les 2 écarts du §2** (logs d'audit, notifications) puis appliquer (a) ou (b).
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
