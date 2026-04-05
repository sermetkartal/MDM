{{- define "common.service" -}}
apiVersion: v1
kind: Service
metadata:
  name: {{ include "common.fullname" . }}
  labels:
    {{- include "common.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type | default "ClusterIP" }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: {{ .Values.service.portName | default "app" }}
      protocol: TCP
      name: {{ .Values.service.portName | default "app" }}
  selector:
    {{- include "common.selectorLabels" . | nindent 4 }}
{{- end }}
