"use client";

import { WIDGET_MODE_LABELS } from "../../lib/widget-modes";
import type { WidgetMode } from "../../types";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";

export function WidgetModeSwitcher({
  modes,
  activeMode,
  disabled,
  onModeChange,
}: {
  modes: ReadonlyArray<WidgetMode>;
  activeMode: WidgetMode;
  disabled?: boolean;
  onModeChange: (mode: WidgetMode) => void;
}) {
  return (
    <Tabs onValueChange={(value) => onModeChange(value as WidgetMode)} value={activeMode}>
      <TabsList className="sk-ui-flex sk-ui-w-full sk-ui-justify-start sk-ui-overflow-x-auto sk-ui-overflow-y-hidden sk-ui-rounded-none sk-ui-px-0 [&::-webkit-scrollbar]:sk-ui-hidden [scrollbar-width:none]">
        {modes.map((mode) => (
          <TabsTrigger
            className="sk-ui-h-full sk-ui-w-auto sk-ui-shrink-0 sk-ui-cursor-pointer sk-ui-bg-transparent sk-ui-transition-colors hover:sk-ui-bg-bg-hover hover:sk-ui-text-foreground data-[state=active]:sk-ui-bg-bg-active"
            disabled={disabled}
            key={mode}
            value={mode}>
            {WIDGET_MODE_LABELS[mode]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
