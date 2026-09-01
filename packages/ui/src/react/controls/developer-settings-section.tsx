"use client";

import { ChevronRightIcon, WrenchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Control } from "react-hook-form";
import { cn } from "../../lib/utils";
import { InputField } from "../components/ui/input-field";
import { JsonTextareaField } from "../components/ui/json-textarea-field";
import { ToggleField } from "../components/ui/toggle-field";
import { isDevToolingEnabled } from "../lib/node-env";
import type { ControlsStoreFieldValues } from "../types";

const DEFAULT_API_BASE_URL = "https://api.swapkit.dev";

type DeveloperSettingsSectionProps = {
  control: Control<ControlsStoreFieldValues>;
  apiBaseUrl: string | undefined;
  devApiUrl: string | undefined;
  developMode: boolean | undefined;
  isHydrated: boolean;
  localMode: ControlsStoreFieldValues["localMode"] | undefined;
  requestParamsEnabled: boolean | undefined;
  quoteParamsError: string | null;
  swapParamsError: string | null;
};

export function DeveloperSettingsSection({
  control,
  apiBaseUrl,
  devApiUrl,
  developMode,
  isHydrated,
  localMode,
  requestParamsEnabled,
  quoteParamsError,
  swapParamsError,
}: DeveloperSettingsSectionProps) {
  // Local mode points quote/swap requests at locally running services, so the
  // toggle only makes sense — and is only shown — when the studio itself is
  // being served from localhost.
  const isLocalhost = useMemo(
    () =>
      typeof window !== "undefined" && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(window.location.hostname),
    [],
  );

  // Header summary of every active developer override — not just developMode —
  // so a collapsed section still says what's been changed.
  const activeOverrides: string[] = [];
  if ((apiBaseUrl ?? "") !== "" && apiBaseUrl !== DEFAULT_API_BASE_URL) activeOverrides.push("API URL");
  if (developMode) activeOverrides.push("Dev");
  if (localMode?.enabled) activeOverrides.push("Local");
  if (requestParamsEnabled) activeOverrides.push("Params");
  const devSettingsStatus = activeOverrides.length > 0 ? activeOverrides.join(" · ") : "Default";

  // Open by default when any developer field is non-default so users see what they've already changed.
  const hasNonDefaultField = Boolean(
    requestParamsEnabled ||
      developMode ||
      localMode?.enabled ||
      (devApiUrl ?? "") !== "" ||
      (apiBaseUrl ?? "") !== DEFAULT_API_BASE_URL,
  );
  const [devSettingsExpanded, setDevSettingsExpanded] = useState(hasNonDefaultField);

  // On a fresh page load the initializer above runs before the form has
  // hydrated from localStorage, so it only ever sees defaults. Re-check once
  // hydration lands — and only then, so a manual collapse isn't fought.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberately only reacts to the hydration flip
  useEffect(() => {
    if (isHydrated && hasNonDefaultField) setDevSettingsExpanded(true);
  }, [isHydrated]);

  return (
    <section>
      <button
        aria-expanded={devSettingsExpanded}
        className="sk-ui-flex sk-ui-w-full sk-ui-items-center sk-ui-gap-2 sk-ui-rounded-md sk-ui-bg-transparent sk-ui-px-1 sk-ui-py-1.5 sk-ui-text-left sk-ui-text-sm sk-ui-text-muted-foreground sk-ui-transition-colors hover:sk-ui-text-foreground focus-visible:sk-ui-outline-none focus-visible:sk-ui-ring-2 focus-visible:sk-ui-ring-ring"
        onClick={() => setDevSettingsExpanded((open) => !open)}
        type="button">
        <WrenchIcon className="sk-ui-w-4 sk-ui-h-4 sk-ui-shrink-0" />
        <span className="sk-ui-shrink-0">Developer settings</span>
        {/* min-w-0 + truncate so a long override combo shortens itself instead
            of pushing the label or chevron out of the row. */}
        <span className="sk-ui-ml-auto sk-ui-min-w-0 sk-ui-truncate sk-ui-text-xs sk-ui-tabular-nums">
          {devSettingsStatus}
        </span>
        <ChevronRightIcon
          className={cn(
            "sk-ui-w-4 sk-ui-h-4 sk-ui-shrink-0 sk-ui-transition-transform sk-ui-duration-150",
            devSettingsExpanded && "sk-ui-rotate-90",
          )}
        />
      </button>

      {devSettingsExpanded && (
        <div className="sk-ui-mt-2.5 sk-ui-flex sk-ui-flex-col sk-ui-gap-4">
          <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-3">
            <h4 className="sk-ui-text-xs sk-ui-font-medium sk-ui-uppercase sk-ui-tracking-wider sk-ui-text-muted-foreground">
              API Routing
            </h4>
            <InputField control={control} label="API Endpoint" name="apiBaseUrl" placeholder={DEFAULT_API_BASE_URL} />
            <ToggleField
              control={control}
              description="Use development endpoints & CDN"
              label="Developer Mode"
              name="developMode"
            />
            {developMode && (
              <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-3 sk-ui-border-l sk-ui-border-border sk-ui-pl-3">
                <InputField
                  control={control}
                  label="Dev API URL"
                  name="devApiUrl"
                  placeholder="https://dev-api.swapkit.dev"
                />
              </div>
            )}

            {/* Local mode is only meaningful when the studio is served from
                localhost, so the toggle is hidden everywhere else. */}
            {isLocalhost && (
              <>
                <ToggleField
                  control={control}
                  description="Route quote & swap requests to locally running services"
                  label="Local Mode"
                  name="localMode.enabled"
                />
                {localMode?.enabled && (
                  <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-3 sk-ui-border-l sk-ui-border-border sk-ui-pl-3">
                    <InputField
                      control={control}
                      label="Quote URL"
                      name="localMode.quoteUrl"
                      placeholder="http://localhost:3000"
                    />
                    <InputField
                      control={control}
                      label="Swap URL"
                      name="localMode.swapUrl"
                      placeholder="http://localhost:3001"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Extra request params for /quote and /swap — a testing escape hatch,
              so only offered where dev tooling is enabled (non-production builds
              and the deployed dev/stage studios). Requests keep going to the
              API / Dev API endpoints configured above. */}
          {isDevToolingEnabled() && (
            <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-3">
              <h4 className="sk-ui-text-xs sk-ui-font-medium sk-ui-uppercase sk-ui-tracking-wider sk-ui-text-muted-foreground">
                Request Params
              </h4>
              <ToggleField
                control={control}
                description="Merge extra JSON params into quote & swap request bodies"
                label="Additional Request Params"
                name="requestParamsEnabled"
              />
              {requestParamsEnabled && (
                <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2 sk-ui-border-l sk-ui-border-border sk-ui-pl-3">
                  <JsonTextareaField
                    className="sk-ui-font-mono sk-ui-text-xs"
                    control={control}
                    description="Sent with every quote request."
                    label="Extra Quote Params (JSON)"
                    name="quoteParams"
                    placeholder='{ "slippage": 3 }'
                    spellCheck={false}
                  />
                  {quoteParamsError && <p className="sk-ui-text-xs sk-ui-text-red-400">{quoteParamsError}</p>}
                  <JsonTextareaField
                    className="sk-ui-font-mono sk-ui-text-xs"
                    control={control}
                    description="Sent with every swap request."
                    label="Extra Swap Params (JSON)"
                    name="swapParams"
                    placeholder='{ "referrer": "..." }'
                    spellCheck={false}
                  />
                  {swapParamsError && <p className="sk-ui-text-xs sk-ui-text-red-400">{swapParamsError}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
