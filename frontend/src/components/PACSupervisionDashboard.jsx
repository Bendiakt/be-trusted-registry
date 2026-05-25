import { useState, useEffect, useCallback } from 'react'
import api from '../lib/api'

const G = {
  card:   { background: '#111', border: '1px solid #1e1e1e', borderRadius: 10, padding: '20px 24px', marginBottom: 16 },
  label:  { fontSize: '0.72rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 },
  value:  { fontSize: '1.05rem', fontWeight: 600, color: '#e2e2e2' },
  gold:   { color: '#C9A84C' },
  green:  { color: '#2ecc71' },
  red:    { color: '#ff6b6b' },
  amber:  { color: '#f39c12' },
  grid3:  { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 },
  grid2:  { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 },
  btn:    { padding: '8px 18px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' },
  pill:   (color) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600, background: color + '22', color }),
  tag:    { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: '0.72rem', background: '#1a1a1a', color: '#888', marginRight: 4 },
  row:    { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  h2:     { fontSize: '1rem', fontWeight: 700, color: '#C9A84C', margin: '0 0 16px' },
}

function fmt (cents) {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function BonusBar ({ pct }) {
  const color = pct >= 80 ? '#2ecc71' : pct >= 70 ? '#f39c12' : '#ff6b6b'
  const label = pct >= 80 ? 'Full bonus' : pct >= 70 ? '50% bonus' : 'Suspended'
  return (
    <div>
      <div style={{ ...G.row, justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: '0.78rem', color: '#777' }}>Task completion</span>
        <span style={{ fontWeight: 700, color }}>{pct}% — {label}</span>
      </div>
      <div style={{ height: 6, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
    </div>
  )
}

function TaskChecklist ({ tasks, templates, summary, pacTier, onTaskComplete }) {
  const [submitting, setSubmitting] = useState(null)
  const [notes, setNotes] = useState('')

  const handleComplete = async (taskType, weekNum) => {
    setSubmitting(taskType)
    try {
      await api.post(`/api/pac/supervision/tasks/${taskType}`, {
        notes: notes || undefined,
        period_week: weekNum || undefined
      })
      onTaskComplete()
    } catch (e) {
      console.error(e)
    } finally {
      setSubmitting(null)
      setNotes('')
    }
  }

  const taskLabels = {
    weekly_checkin:            'Check-in individuel S1',
    weekly_report_review:      'Revue rapports S1',
    weekly_mentoring:          'Mentoring S2',
    weekly_spot_check:         'Audit spot-check S1',
    monthly_supervision_report:'Rapport de supervision mensuel',
    monthly_training:          'Session formation collective',
    monthly_executive_report:  'Rapport exécutif mensuel',
    monthly_strategic_session: 'Session stratégique B&E HQ',
    quarterly_s2_evaluation:   'Évaluation formelle S2',
    ad_hoc_escalation:         'Escalade incident',
  }

  return (
    <div style={G.card}>
      <h3 style={G.h2}>Tâches de supervision — ce mois</h3>
      <BonusBar pct={summary?.completion_pct || 0} />
      <div style={{ marginTop: 16 }}>
        {templates.map(tpl => {
          const done = tasks.find(t => t.task_type === tpl && t.completed)
          return (
            <div key={tpl} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #1a1a1a' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1rem', color: done ? '#2ecc71' : '#333' }}>{done ? '✓' : '○'}</span>
                <span style={{ color: done ? '#666' : '#ccc', textDecoration: done ? 'line-through' : 'none', fontSize: '0.88rem' }}>
                  {taskLabels[tpl] || tpl}
                </span>
                {tpl.startsWith('weekly_') && <span style={G.tag}>Hebdo</span>}
                {tpl.startsWith('monthly_') && <span style={G.tag}>Mensuel</span>}
              </div>
              {!done && (
                <button
                  style={{ ...G.btn, background: '#C9A84C22', color: '#C9A84C', border: '1px solid #C9A84C44' }}
                  onClick={() => handleComplete(tpl)}
                  disabled={submitting === tpl}
                >
                  {submitting === tpl ? '…' : 'Marquer fait'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── S2 Dashboard ──────────────────────────────────────────────────────────────
function S2Dashboard () {
  const [team, setTeam]       = useState(null)
  const [tasks, setTasks]     = useState(null)
  const [bonus, setBonus]     = useState(null)
  const [sim, setSim]         = useState(null)
  const [superviseId, setSup] = useState('')
  const [supMsg, setSupMsg]   = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [teamRes, tasksRes, bonusRes] = await Promise.all([
        api.get('/api/pac/supervision/team'),
        api.get('/api/pac/supervision/tasks'),
        api.get('/api/pac/supervision/bonus'),
      ])
      setTeam(teamRes.data)
      setTasks(tasksRes.data)
      setBonus(bonusRes.data)
      // Load simulator with defaults
      const simRes = await api.get('/api/pac/supervision/simulator')
      setSim(simRes.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSupervise = async () => {
    if (!superviseId) return
    try {
      await api.post('/api/pac/supervise', { supervised_user_id: parseInt(superviseId, 10) })
      setSupMsg('✅ Demande envoyée — en attente d\'approbation B&E')
      setSup('')
      load()
    } catch (e) {
      setSupMsg('❌ ' + (e.response?.data?.error || 'Erreur'))
    }
  }

  if (loading) return <div style={{ color: '#555', textAlign: 'center', padding: 40 }}>Chargement…</div>

  const preview = team?.preview
  const summary = tasks?.summary

  return (
    <div>
      {/* KPI bar */}
      <div style={G.grid3}>
        <div style={G.card}>
          <div style={G.label}>S1 actifs</div>
          <div style={G.value}>{team?.team?.filter(t=>t.supervision_status==='active').length || 0} <span style={{ fontSize:'0.75rem', color:'#555' }}>/ 10 max</span></div>
        </div>
        <div style={G.card}>
          <div style={G.label}>Bonus estimé ce mois</div>
          <div style={{ ...G.value, ...G.gold }}>{fmt(preview?.estimated_bonus_cents || 0)}</div>
          <div style={{ fontSize: '0.72rem', color: '#555', marginTop: 2 }}>payé M+1 après validation</div>
        </div>
        <div style={G.card}>
          <div style={G.label}>Total reçu (historique)</div>
          <div style={{ ...G.value, ...G.green }}>{bonus?.total_paid_usd ? '$' + bonus.total_paid_usd : '$0.00'}</div>
        </div>
      </div>

      {/* Task checklist */}
      {tasks && (
        <TaskChecklist
          tasks={tasks.tasks}
          templates={tasks.task_templates}
          summary={tasks.summary}
          pacTier="S2"
          onTaskComplete={load}
        />
      )}

      {/* My S1 team */}
      <div style={G.card}>
        <h3 style={G.h2}>Mon équipe S1</h3>
        {team?.team?.length === 0 && (
          <p style={{ color: '#555', fontSize: '0.88rem' }}>Aucun agent sous supervision. Soumettez une demande ci-dessous.</p>
        )}
        {team?.team?.map(agent => (
          <div key={agent.supervision_id} style={{ padding: '12px 0', borderBottom: '1px solid #1a1a1a' }}>
            <div style={G.row}>
              <span style={{ color: '#e2e2e2', fontWeight: 600, fontSize: '0.9rem' }}>{agent.full_name || agent.email}</span>
              <span style={G.pill(agent.supervision_status === 'active' ? '#2ecc71' : '#f39c12')}>
                {agent.supervision_status}
              </span>
              <span style={{ ...G.tag }}>{agent.location || '—'}</span>
            </div>
            <div style={{ display: 'flex', gap: 24, marginTop: 6 }}>
              <span style={{ fontSize: '0.78rem', color: '#666' }}>
                Missions ce mois : <strong style={{ color: '#ccc' }}>{agent.missions_completed_month}</strong>
              </span>
              <span style={{ fontSize: '0.78rem', color: '#666' }}>
                CA ce mois : <strong style={{ color: '#C9A84C' }}>{fmt(agent.gross_revenue_cents_month)}</strong>
              </span>
              <span style={{ fontSize: '0.78rem', color: '#666' }}>
                Total missions : <strong style={{ color: '#ccc' }}>{agent.missions_total}</strong>
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Bonus preview breakdown */}
      {preview && (
        <div style={G.card}>
          <h3 style={G.h2}>Calcul bonus — {preview.month}</h3>
          <div style={G.grid2}>
            <div>
              <div style={G.label}>CA brut S1 encadrés</div>
              <div style={G.value}>{fmt(preview.gross_revenue_cents)}</div>
            </div>
            <div>
              <div style={G.label}>Commissions versées S1</div>
              <div style={{ ...G.value, color: '#ff6b6b' }}>−{fmt(preview.commissions_cents)}</div>
            </div>
            <div>
              <div style={G.label}>Bénéfice net B&E (base)</div>
              <div style={G.value}>{fmt(preview.net_be_cents)}</div>
            </div>
            <div>
              <div style={G.label}>Bonus S2 (5% × bénéfice net)</div>
              <div style={{ ...G.value, ...G.gold }}>{fmt(preview.estimated_bonus_cents)}</div>
            </div>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#555', marginTop: 8 }}>
            Versement avant le 10 du mois suivant — conditionné à la validation admin et au paiement client confirmé.
          </p>
        </div>
      )}

      {/* Simulator */}
      {sim && (
        <div style={G.card}>
          <h3 style={G.h2}>Simulateur de revenus</h3>
          <div style={G.grid2}>
            <div>
              <div style={G.label}>Missions/agent/mois</div>
              <div style={{ ...G.value, ...G.gold }}>{sim.inputs.missions_per_agent_month}</div>
            </div>
            <div>
              <div style={G.label}>Valeur moyenne mission</div>
              <div style={{ ...G.value, ...G.gold }}>${sim.inputs.avg_fee_usd}</div>
            </div>
            <div>
              <div style={G.label}>Bonus mensuel estimé (10 S1)</div>
              <div style={{ ...G.value, ...G.green }}>${sim.monthly.estimated_bonus_usd}</div>
            </div>
            <div>
              <div style={G.label}>Bonus annuel projeté</div>
              <div style={{ ...G.value, ...G.green }}>${sim.annual.estimated_bonus_usd}</div>
            </div>
          </div>
        </div>
      )}

      {/* Request supervision */}
      <div style={G.card}>
        <h3 style={G.h2}>Encadrer un agent S1</h3>
        <div style={G.row}>
          <input
            placeholder="User ID du S1 à encadrer"
            value={superviseId}
            onChange={e => setSup(e.target.value)}
            style={{ flex: 1, padding: '10px 14px', background: '#0a0a0a', border: '1px solid #222', borderRadius: 6, color: '#e2e2e2', fontSize: '0.9rem' }}
          />
          <button style={{ ...G.btn, background: '#C9A84C', color: '#000' }} onClick={handleSupervise}>
            Envoyer demande
          </button>
        </div>
        {supMsg && <p style={{ marginTop: 8, fontSize: '0.85rem', color: supMsg.startsWith('✅') ? '#2ecc71' : '#ff6b6b' }}>{supMsg}</p>}
      </div>

      {/* Bonus history */}
      {bonus?.history?.length > 0 && (
        <div style={G.card}>
          <h3 style={G.h2}>Historique des bonus</h3>
          {bonus.history.map(row => (
            <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #111', fontSize: '0.85rem' }}>
              <span style={{ color: '#888' }}>{row.period_year}-{String(row.period_month).padStart(2,'0')} · {row.bonus_level}</span>
              <span style={{ color: '#C9A84C', fontWeight: 600 }}>{fmt(row.final_bonus_cents || 0)}</span>
              <span style={G.pill(
                row.status === 'paid' ? '#2ecc71' :
                row.status === 'validated' ? '#C9A84C' :
                row.status === 'draft' ? '#666' : '#ff6b6b'
              )}>{row.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── S3 Dashboard ──────────────────────────────────────────────────────────────
function S3Dashboard () {
  const [org, setOrg]       = useState(null)
  const [tasks, setTasks]   = useState(null)
  const [bonus, setBonus]   = useState(null)
  const [expanded, setExp]  = useState({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [orgRes, tasksRes, bonusRes] = await Promise.all([
        api.get('/api/pac/supervision/org'),
        api.get('/api/pac/supervision/tasks'),
        api.get('/api/pac/supervision/bonus'),
      ])
      setOrg(orgRes.data)
      setTasks(tasksRes.data)
      setBonus(bonusRes.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ color: '#555', textAlign: 'center', padding: 40 }}>Chargement…</div>

  const totalL1Cents = (org?.estimated_bonus_l1_cents || 0) + (org?.estimated_bonus_l2_cents || 0)
  const summary = tasks?.summary

  return (
    <div>
      {/* KPI bar */}
      <div style={G.grid3}>
        <div style={G.card}>
          <div style={G.label}>Organisation</div>
          <div style={G.value}>
            <span style={G.gold}>{org?.total_s2s || 0}</span> S2 · <span style={G.gold}>{org?.total_s1s || 0}</span> S1
          </div>
        </div>
        <div style={G.card}>
          <div style={G.label}>Bonus estimé ce mois (L1+L2)</div>
          <div style={{ ...G.value, ...G.gold }}>{fmt(totalL1Cents)}</div>
          <div style={{ fontSize: '0.72rem', color: '#555', marginTop: 2 }}>payé M+1 après validation</div>
        </div>
        <div style={G.card}>
          <div style={G.label}>Total reçu (historique)</div>
          <div style={{ ...G.value, ...G.green }}>{bonus?.total_paid_usd ? '$' + bonus.total_paid_usd : '$0.00'}</div>
        </div>
      </div>

      {/* Task checklist */}
      {tasks && (
        <TaskChecklist
          tasks={tasks.tasks}
          templates={tasks.task_templates}
          summary={tasks.summary}
          pacTier="S3"
          onTaskComplete={load}
        />
      )}

      {/* Org tree */}
      <div style={G.card}>
        <h3 style={G.h2}>Organisation — Arbre S3 → S2 → S1</h3>
        {!org?.s2s?.length && (
          <p style={{ color: '#555', fontSize: '0.88rem' }}>Aucun S2 sous votre mentoring. Soumettez une demande de supervision.</p>
        )}
        {org?.s2s?.map(s2 => (
          <div key={s2.id} style={{ marginBottom: 12, border: '1px solid #1a1a1a', borderRadius: 8, overflow: 'hidden' }}>
            {/* S2 row */}
            <div
              style={{ padding: '12px 16px', background: '#0e0e0e', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              onClick={() => setExp(p => ({ ...p, [s2.id]: !p[s2.id] }))}
            >
              <div style={G.row}>
                <span style={{ ...G.pill('#C9A84C'), fontSize: '0.7rem' }}>S2</span>
                <span style={{ color: '#e2e2e2', fontWeight: 600 }}>{s2.full_name || s2.email}</span>
                <span style={{ color: '#555', fontSize: '0.8rem' }}>{s2.location || '—'}</span>
                <span style={G.pill(s2.supervision_status === 'active' ? '#2ecc71' : '#f39c12')}>
                  {s2.supervision_status}
                </span>
              </div>
              <div style={{ color: '#555', fontSize: '0.85rem' }}>
                {s2.s1s?.length || 0} S1 · {expanded[s2.id] ? '▲' : '▼'}
              </div>
            </div>
            {/* S1 sub-rows */}
            {expanded[s2.id] && s2.s1s?.map(s1 => (
              <div key={s1.id} style={{ padding: '10px 16px 10px 32px', borderTop: '1px solid #111', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={G.row}>
                  <span style={{ ...G.pill('#4a9eff'), fontSize: '0.7rem' }}>S1</span>
                  <span style={{ color: '#ccc', fontSize: '0.88rem' }}>{s1.full_name || s1.email}</span>
                  <span style={{ color: '#555', fontSize: '0.78rem' }}>{s1.location || '—'}</span>
                </div>
                <span style={{ color: '#888', fontSize: '0.78rem' }}>{s1.missions_total} missions</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Bonus history */}
      {bonus?.history?.length > 0 && (
        <div style={G.card}>
          <h3 style={G.h2}>Historique des bonus</h3>
          {bonus.history.map(row => (
            <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #111', fontSize: '0.85rem' }}>
              <span style={{ color: '#888' }}>{row.period_year}-{String(row.period_month).padStart(2,'0')} · Niveau {row.bonus_level}</span>
              <span style={{ color: '#C9A84C', fontWeight: 600 }}>{fmt(row.final_bonus_cents || 0)}</span>
              <span style={G.pill(
                row.status === 'paid' ? '#2ecc71' :
                row.status === 'validated' ? '#C9A84C' : '#666'
              )}>{row.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function PACSupervisionDashboard ({ pacTier }) {
  if (pacTier === 'S3') return <S3Dashboard />
  if (pacTier === 'S2') return <S2Dashboard />
  return (
    <div style={{ ...G.card, textAlign: 'center', color: '#555' }}>
      <p style={{ fontSize: '0.9rem' }}>La supervision est disponible à partir du niveau S2.</p>
      <p style={{ fontSize: '0.8rem', marginTop: 8 }}>
        Complétez vos missions et obtenez votre certification S2 pour accéder au programme de supervision.
      </p>
    </div>
  )
}
