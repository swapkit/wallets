import { cn } from "../../../lib/utils";
import { SwapKitLogo } from "../../assets/swapkit-logo";

const sizeClasses = { lg: "sk-ui-w-16 sk-ui-h-16", md: "sk-ui-w-10 sk-ui-h-10", sm: "sk-ui-w-6 sk-ui-h-6" } as const;

interface SwapKitSpinnerProps {
  size?: keyof typeof sizeClasses;
  className?: string;
  color?: string;
}

export function SwapKitSpinner({ size = "md", className, color }: SwapKitSpinnerProps) {
  return (
    <div className={cn("sk-ui-animate-spin", className)}>
      <SwapKitLogo className={sizeClasses[size]} color={color} />
    </div>
  );
}

interface SwapKitPulseProps {
  size?: keyof typeof sizeClasses;
  className?: string;
  color?: string;
}

export function SwapKitPulse({ size = "md", className, color }: SwapKitPulseProps) {
  return (
    <div className={cn("sk-ui-animate-pulse", className)}>
      <SwapKitLogo className={sizeClasses[size]} color={color} />
    </div>
  );
}

interface SwapKitLoaderProps {
  className?: string;
}

export function SwapKitLoader({ className }: SwapKitLoaderProps) {
  return (
    <div
      className={cn(
        "sk-ui-min-h-screen sk-ui-bg-background sk-ui-flex sk-ui-items-center sk-ui-justify-center",
        className,
      )}>
      <SwapKitPulse size="lg" />
    </div>
  );
}
