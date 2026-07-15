import { AlertCircle, CheckCircle2 } from "lucide-react";

type SettingsAlertsProps = {
  error: string;
  success: string;
};

export default function SettingsAlerts({ error, success }: SettingsAlertsProps) {
  if (!error && !success) return null;

  return (
    <>
      {error && (
        <div className="alert alert-destructive settings-alert" role="alert">
          <AlertCircle size={16} className="alert-icon" strokeWidth={1.75} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="alert alert-success settings-alert" role="status">
          <CheckCircle2 size={16} className="alert-icon" strokeWidth={1.75} />
          <span>{success}</span>
        </div>
      )}
    </>
  );
}
