terraform {
  required_version = ">= 1.0"

  required_providers {
    sentry = {
      source  = "jianyuan/sentry"
      version = "~> 0.13"
    }
  }
}

provider "sentry" {
  token = var.sentry_token
  # base_url defaults to https://sentry.io/api/0/ — do not override for sentry.io
}

# ── Alert 1 — Error spike (> 10 erreurs en 5 minutes) ────────────────────────
resource "sentry_issue_alert" "error_spike" {
  organization = var.org_slug
  project      = var.project_slug
  name         = "Error spike > 10 in 5 min"

  action_match = "all"
  filter_match = "all"
  frequency    = 60

  conditions_v2 = [
    {
      event_frequency = {
        comparison_type = "count"
        value           = 10
        interval        = "5m"
      }
      event_frequency_percent      = null
      event_unique_user_frequency  = null
      existing_high_priority_issue = null
      first_seen_event             = null
      new_high_priority_issue      = null
      reappeared_event             = null
      regression_event             = null
    }
  ]

  filters_v2 = []

  actions_v2 = [
    {
      notify_email = {
        target_type      = "IssueOwners"
        fallthrough_type = "AllMembers"
      }
      azure_devops_create_ticket  = null
      discord_notify_service      = null
      github_create_ticket        = null
      github_enterprise_create_ticket = null
      jira_create_ticket          = null
      jira_server_create_ticket   = null
      msteams_notify_service      = null
      notify_event                = null
      notify_event_sentry_app     = null
      notify_event_service        = null
      opsgenie_notify_team        = null
      pagerduty_notify_service    = null
      slack_notify_service        = null
    }
  ]
}

# ── Alert 2 — Nouveau problème (première occurrence) ─────────────────────────
resource "sentry_issue_alert" "new_issue" {
  organization = var.org_slug
  project      = var.project_slug
  name         = "New issue — first occurrence"

  action_match = "all"
  filter_match = "all"
  frequency    = 60

  conditions_v2 = [
    {
      first_seen_event = {}
      event_frequency              = null
      event_frequency_percent      = null
      event_unique_user_frequency  = null
      existing_high_priority_issue = null
      new_high_priority_issue      = null
      reappeared_event             = null
      regression_event             = null
    }
  ]

  filters_v2 = []

  actions_v2 = [
    {
      notify_email = {
        target_type      = "IssueOwners"
        fallthrough_type = "AllMembers"
      }
      azure_devops_create_ticket  = null
      discord_notify_service      = null
      github_create_ticket        = null
      github_enterprise_create_ticket = null
      jira_create_ticket          = null
      jira_server_create_ticket   = null
      msteams_notify_service      = null
      notify_event                = null
      notify_event_sentry_app     = null
      notify_event_service        = null
      opsgenie_notify_team        = null
      pagerduty_notify_service    = null
      slack_notify_service        = null
    }
  ]
}

# ── Alert 3 — p95 latency > 2000 ms ──────────────────────────────────────────
# REQUIRES Sentry Business plan (Performance Monitoring feature).
# Uncomment and run `terraform apply` once upgraded.
#
# resource "sentry_metric_alert" "p95_latency" {
#   organization   = var.org_slug
#   project        = var.project_slug
#   name           = "p95 latency > 2000 ms"
#   dataset        = "transactions"
#   query          = ""
#   aggregate      = "p95(transaction.duration)"
#   time_window    = 5
#   threshold_type = 0   # 0 = above, 1 = below
#
#   trigger {
#     label           = "critical"
#     threshold_type  = 0
#     alert_threshold = 2000
#     action {
#       type              = "email"
#       target_type       = "team"
#       target_identifier = var.team_id
#     }
#   }
#
#   trigger {
#     label           = "warning"
#     threshold_type  = 0
#     alert_threshold = 1500
#     action {
#       type              = "email"
#       target_type       = "team"
#       target_identifier = var.team_id
#     }
#   }
# }
