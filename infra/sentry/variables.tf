variable "sentry_token" {
  description = "Sentry auth token — Settings → Auth Tokens → Create New Token (scope: project:write, alerts:write)"
  type        = string
  sensitive   = true
}

variable "org_slug" {
  description = "Sentry organization slug — visible in the URL: sentry.io/organizations/<slug>/"
  type        = string
}

variable "project_slug" {
  description = "Sentry project slug for the backend Node.js project"
  type        = string
  default     = "mydd-backend"
}

variable "alert_email" {
  description = "Email address that receives alert notifications"
  type        = string
  default     = "ben.diakhate@b-econsult.com"
}

variable "team_id" {
  description = "Sentry team ID for metric alert notifications — Settings → Teams → <team> → copy the numeric ID from the URL"
  type        = string
}
