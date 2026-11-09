{{- define "taskq.labels" -}}
app.kubernetes.io/part-of: taskq
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{- define "taskq.image" -}}
{{ .Values.image.repository }}:{{ .Values.image.tag }}
{{- end }}

{{- define "taskq.dbSecretName" -}}
{{ .Values.database.existingSecret | default "taskq-db" }}
{{- end }}

{{- define "taskq.databaseUrl" -}}
{{- if .Values.database.url -}}
{{ .Values.database.url }}
{{- else if .Values.postgres.enabled -}}
postgres://{{ .Values.postgres.user }}:{{ .Values.postgres.password }}@postgres.{{ .Release.Namespace }}.svc.cluster.local:5432/{{ .Values.postgres.database }}?sslmode=disable
{{- else -}}
{{- fail "set database.existingSecret, database.url, or postgres.enabled" -}}
{{- end -}}
{{- end }}

{{- define "taskq.podSecurityContext" -}}
runAsNonRoot: true
seccompProfile:
  type: RuntimeDefault
{{- end }}

{{- define "taskq.containerSecurityContext" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop: ["ALL"]
{{- end }}
