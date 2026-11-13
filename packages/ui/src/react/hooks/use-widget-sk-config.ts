"use client";

import { SKConfig } from "@swapkit/helpers";
import { useEffect, useState } from "react";

const DEFAULT_API_URL = SKConfig.getState().envs.apiUrl;
const DEFAULT_DEV_API_URL = SKConfig.getState().envs.devApiUrl;

export function normalizeApiUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  if (trimmed.startsWith("localhost") || trimmed.startsWith("127.0.0.1")) {
    return `http://${trimmed}`;
  }

  return `https://${trimmed}`;
}

export type WidgetSKConfigInput = {
  apiKey?: string;
  widgetId?: string;
  widgetKey?: string;
  apiBaseUrl?: string | null;
  developMode?: boolean;
  devApiUrl?: string | null;
  config?: { apiKeys?: Record<string, unknown>; integrations?: Record<string, unknown> };
};

function applyConfigPatch(config: WidgetSKConfigInput["config"]) {
  if (!config) return;
  try {
    SKConfig.set(config as Parameters<typeof SKConfig.set>[0]);
  } catch (error) {
    console.warn("[SwapKit] Failed to apply `config` prop payload:", error);
  }
}

function applyEnvs({ apiBaseUrl, developMode, devApiUrl }: WidgetSKConfigInput) {
  SKConfig.setEnv("apiUrl", normalizeApiUrl(apiBaseUrl) ?? DEFAULT_API_URL);
  SKConfig.setEnv("isDev", developMode ?? false);
  SKConfig.setEnv("devApiUrl", normalizeApiUrl(devApiUrl) ?? DEFAULT_DEV_API_URL);
}

function applyAuth({ apiKey, widgetId, widgetKey }: WidgetSKConfigInput) {
  if (apiKey) {
    SKConfig.set({ apiKeys: { swapKit: apiKey } });
    SKConfig.setWidgetId("");
    SKConfig.setWidgetKey("");
  } else if (widgetId && widgetKey) {
    SKConfig.set({ apiKeys: { swapKit: "" } });
    SKConfig.setWidgetId(widgetId);
    SKConfig.setWidgetKey(widgetKey);
  } else if (!widgetId && !widgetKey) {
    SKConfig.set({ apiKeys: { swapKit: "" } });
    SKConfig.setWidgetId("");
    SKConfig.setWidgetKey("");
  }
}

function warnOnMissingAuth({ apiKey, widgetId, widgetKey }: WidgetSKConfigInput) {
  const effectiveWidgetId = widgetId || SKConfig.get("widgetId");
  const effectiveWidgetKey = widgetKey || SKConfig.get("widgetKey");
  const hasWidgetAuth = effectiveWidgetId && effectiveWidgetKey;
  const hasApiKey = apiKey || SKConfig.get("apiKeys")?.swapKit;
  const hasPartialWidgetAuth = !hasWidgetAuth && Boolean(effectiveWidgetId) !== Boolean(effectiveWidgetKey);

  if (hasPartialWidgetAuth && !hasApiKey) {
    console.warn(
      "[SwapKit] Partial widget auth: widgetId and widgetKey must be set together. Requests will fail authentication.",
    );
  } else if (!hasWidgetAuth && !hasApiKey) {
    console.warn(
      "[SwapKit] No widget auth or api-key configured. API requests will fail authentication. " +
        "Pass both widgetId + widgetKey, or apiKey, or configure auth via SKConfig.",
    );
  }
}

type AppliedSnapshots = Partial<Record<"config" | "envs" | "auth", string>>;

function applyChangedGroups(input: WidgetSKConfigInput, applied: AppliedSnapshots) {
  const groups = [
    ["config", JSON.stringify(input.config ?? null), () => applyConfigPatch(input.config)],
    ["envs", JSON.stringify([input.apiBaseUrl, input.developMode, input.devApiUrl]), () => applyEnvs(input)],
    ["auth", JSON.stringify([input.apiKey, input.widgetId, input.widgetKey]), () => applyAuth(input)],
  ] as const;

  for (const [group, snapshot, apply] of groups) {
    if (applied[group] === snapshot) continue;
    apply();
    applied[group] = snapshot;
  }
}

export function useApplyWidgetSKConfig(input: WidgetSKConfigInput) {
  const { apiKey, widgetId, widgetKey } = input;
  const [applied] = useState<AppliedSnapshots>(() => {
    SKConfig.set({ v3SwapFlow: { enabled: true } });
    const snapshots: AppliedSnapshots = {};
    applyChangedGroups(input, snapshots);
    return snapshots;
  });

  useEffect(() => {
    applyChangedGroups(input, applied);
  });

  useEffect(() => {
    warnOnMissingAuth({ apiKey, widgetId, widgetKey });
  }, [apiKey, widgetId, widgetKey]);
}
