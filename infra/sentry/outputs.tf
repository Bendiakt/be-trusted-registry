output "error_spike_alert_id" {
  description = "ID of the error spike issue alert"
  value       = sentry_issue_alert.error_spike.id
}

output "new_issue_alert_id" {
  description = "ID of the new issue alert"
  value       = sentry_issue_alert.new_issue.id
}

# output "p95_latency_alert_id" {
#   description = "Internal ID of the p95 latency metric alert (Sentry Business plan required)"
#   value       = sentry_metric_alert.p95_latency.internal_id
# }
