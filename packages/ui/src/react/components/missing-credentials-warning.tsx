import { useApiConfig } from "../lib/query-client";

export function MissingCredentialsWarning() {
  const { hasAuth } = useApiConfig();
  if (hasAuth) return null;
  return (
    <div className="sk-ui-rounded sk-ui-bg-muted sk-ui-p-3 sk-ui-text-sm sk-ui-text-muted-foreground" role="alert">
      API credentials are required to fetch quotes and prices. Configure an API key or a widget ID and widget key.
    </div>
  );
}
