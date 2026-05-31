# MyDD — Canal de support client & SLA

> Définit les canaux de contact, leur périmètre, les délais de réponse cibles et
> la procédure d'escalade. Couvre le verrou §5 de la go-live checklist
> (« Canal de support client défini »).
>
> Éditeur : B&E Consult FZCO (Dubai, UAE).

---

## 1. Adresses & périmètre

| Adresse | Périmètre | Déjà câblée |
|---|---|---|
| `support@mydd.work` | Support produit : connexion, certification, paiements, missions PAC, bugs. | ✅ emails transactionnels (`backend/lib/mailer.js`) + OpenAPI contact (`backend/openapi.yaml`) |
| `privacy@mydd.work` | Demandes RGPD (accès, effacement, opposition, limitation), questions DPO. | ✅ Politique de confidentialité (`Legal.jsx`) |
| `legal@mydd.work` | Questions contractuelles, CGU, signalements juridiques. | ✅ CGU + footer (`Legal.jsx`) |

> Les trois alias doivent **router vers une boîte réellement relevée**. À vérifier
> avant lancement : envoyer un email de test à chacun et confirmer la réception.

---

## 2. SLA — délais de réponse cibles

| Priorité | Définition | 1ère réponse | Résolution cible |
|---|---|---|---|
| **P1 — Critique** | Service indisponible, paiement bloqué, faille de sécurité. | 4 h ouvrées | 24 h |
| **P2 — Élevée** | Fonction majeure dégradée (certification, upload), pas de contournement. | 1 jour ouvré | 3 jours ouvrés |
| **P3 — Normale** | Question, bug mineur avec contournement. | 2 jours ouvrés | 5 jours ouvrés |
| **RGPD** | Droits des personnes (Art. 15-21). | Accusé sous 3 jours | **30 jours** (obligation légale) |

Heures ouvrées : dimanche–jeudi, 9h–18h (GST, UTC+4). Hors de ces plages, seules
les alertes P1 sont traitées (cf. astreinte §4).

---

## 3. Triage — comment une demande est classée

1. **Entrée** : email vers un des 3 alias (ou « Reply » sur un email transactionnel).
2. **Catégorisation** : produit → `support@`, données → `privacy@`, contrat → `legal@`.
3. **Priorisation** : P1/P2/P3 selon le tableau §2.
4. **Accusé de réception** automatique ou manuel dans le délai « 1ère réponse ».
5. **Suivi** : un fil = un ticket ; clore uniquement après confirmation client.

---

## 4. Escalade & astreinte technique

- **P1 technique** : corréler avec les alertes automatiques —
  - Sentry (3 règles : error spike, new issue, regression → email,
    `infra/sentry/main.tf`).
  - Monitor / DB-audit LaunchAgents → Slack webhook
    (`scripts/activate-slack-alerting.sh`).
  - Sondes santé : `/api/health`, `/api/health/live`, `/api/health/ready`.
- **Chaîne d'escalade** : support → responsable technique → éditeur (B&E Consult).
- **Incident sécurité / violation de données** : déclencher la procédure de
  notification RGPD (Art. 33/34) — notifier l'autorité de contrôle sous 72 h si
  risque pour les personnes. Contact : `privacy@mydd.work`.

---

## 5. Avant le go-live — checklist support

- [ ] Les 3 alias (`support@`, `privacy@`, `legal@`) reçoivent et sont relevés.
- [ ] Email de test envoyé et reçu sur chacun.
- [ ] Responsable du suivi désigné + plage d'astreinte P1 définie.
- [ ] Modèles de réponse RGPD prêts (accusé + réponse sous 30 jours).
- [ ] SLA publié ou communiqué aux premiers clients (soft-launch).
- [x] Lien « Support » / contact visible depuis l'app → page **`/support`**
      (`frontend/src/pages/Support.jsx`), liée depuis les footers Landing & Legal.

> ✅ La page `/support` regroupe canaux, SLA et droits RGPD self-service. Les
> autres cases sont opérationnelles (boîtes à relever, astreinte, modèles).
