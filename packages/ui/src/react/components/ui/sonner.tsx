"use client";

import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

export const SWAPKIT_WIDGET_TOASTER_ID = "swapkit-widget-toaster";

// Sonner paints toasts from its own CSS variables and hardcodes the description color, so both are overridden here
const toasterStyle = {
  "--normal-bg": "hsl(var(--sk-ui-background))",
  "--normal-border": "hsl(var(--sk-ui-border))",
  "--normal-text": "hsl(var(--sk-ui-foreground))",
} as React.CSSProperties;

const Toaster = ({ style, ...props }: ToasterProps) => {
  return (
    <Sonner
      className="sk-ui-toaster sk-ui-group"
      id={SWAPKIT_WIDGET_TOASTER_ID}
      style={{ ...toasterStyle, ...style }}
      swipeDirections={[]}
      toastOptions={{
        classNames: {
          actionButton: "group-[.toast]:sk-ui-bg-primary group-[.toast]:sk-ui-text-primary-foreground",
          cancelButton: "group-[.toast]:sk-ui-bg-muted group-[.toast]:sk-ui-text-muted-foreground",
          content: "sk-ui-max-w-full",
          description: "!sk-ui-text-muted-foreground",
          toast: "sk-ui-group toast sk-ui-shadow-lg",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
