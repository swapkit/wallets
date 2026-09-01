"use client";

import { RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../../lib/utils";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

const REFRESH_INTERVAL_MS = 60_000;
const HOVER_FILL_MS = 1000;
const CENTER = 14;
const RADIUS = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface QuoteRefreshButtonProps {
  onRefresh: () => void;
  isRefreshing?: boolean;
  className?: string;
}

export function QuoteRefreshButton({ onRefresh, isRefreshing, className }: QuoteRefreshButtonProps) {
  const [animKey, setAnimKey] = useState(0);
  const progressRef = useRef<SVGCircleElement>(null);
  const arrowRef = useRef<SVGGElement>(null);
  const arcAnimRef = useRef<Animation | null>(null);
  const arrowAnimRef = useRef<Animation | null>(null);
  const hoverArcRef = useRef<Animation | null>(null);
  const hoverArrowRef = useRef<Animation | null>(null);

  const handleRefresh = useCallback(() => {
    setAnimKey((k) => k + 1);
    onRefresh();
  }, [onRefresh]);

  // Start animations + auto-refresh timer (animKey restarts cycle after refresh)
  useEffect(() => {
    void animKey;

    const arcAnim = progressRef.current?.animate(
      [{ strokeDashoffset: String(CIRCUMFERENCE) }, { strokeDashoffset: "0" }],
      { duration: REFRESH_INTERVAL_MS, fill: "forwards" },
    );
    const arrowAnim = arrowRef.current?.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {
      duration: REFRESH_INTERVAL_MS,
      fill: "forwards",
    });

    arcAnimRef.current = arcAnim ?? null;
    arrowAnimRef.current = arrowAnim ?? null;

    const timer = setTimeout(handleRefresh, REFRESH_INTERVAL_MS);

    return () => {
      arcAnim?.cancel();
      arrowAnim?.cancel();
      clearTimeout(timer);
    };
  }, [animKey, handleRefresh]);

  // Reset animation when refresh completes
  useEffect(() => {
    if (!isRefreshing) {
      setAnimKey((k) => k + 1);
    }
  }, [isRefreshing]);

  const handleMouseEnter = useCallback(() => {
    arcAnimRef.current?.pause();
    arrowAnimRef.current?.pause();

    hoverArcRef.current =
      progressRef.current?.animate([{ strokeDashoffset: "0" }], {
        duration: HOVER_FILL_MS,
        easing: "ease-in-out",
        fill: "forwards",
      }) ?? null;

    hoverArrowRef.current =
      arrowRef.current?.animate([{ transform: "rotate(360deg)" }], {
        duration: HOVER_FILL_MS,
        easing: "ease-in-out",
        fill: "forwards",
      }) ?? null;
  }, []);

  const handleMouseLeave = useCallback(() => {
    hoverArcRef.current?.cancel();
    hoverArrowRef.current?.cancel();
    hoverArcRef.current = null;
    hoverArrowRef.current = null;

    arcAnimRef.current?.play();
    arrowAnimRef.current?.play();
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label="Refresh quote"
          className={cn(
            "sk-ui-group sk-ui-relative sk-ui-flex sk-ui-items-center sk-ui-justify-center sk-ui-rounded-full sk-ui-p-0 sk-ui-size-7",
            className,
          )}
          disabled={isRefreshing}
          onClick={handleRefresh}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          size="unstyled"
          variant="ghost">
          {isRefreshing ? (
            <RefreshCwIcon className="sk-ui-size-4 sk-ui-text-primary sk-ui-animate-spin" />
          ) : (
            <svg
              aria-hidden="true"
              className="sk-ui-size-7 sk-ui-text-muted-foreground"
              key={animKey}
              viewBox="0 0 28 28">
              {/* Faint background track */}
              <circle
                cx={CENTER}
                cy={CENTER}
                fill="none"
                opacity="0.15"
                r={RADIUS}
                stroke="currentColor"
                strokeWidth="2"
              />

              {/* Progress arc — draws clockwise from top */}
              <circle
                cx={CENTER}
                cy={CENTER}
                fill="none"
                r={RADIUS}
                ref={progressRef}
                stroke="currentColor"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE}
                strokeWidth="2.5"
                transform={`rotate(-90, ${CENTER}, ${CENTER})`}
              />

              {/* Chevron arrowhead at leading edge */}
              <g
                className="sk-ui-text-muted-foreground"
                ref={arrowRef}
                style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}>
                <path
                  d="M12.5,6 L15,8 L12.5,10"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </g>
            </svg>
          )}
        </Button>
      </TooltipTrigger>

      <TooltipContent>Refresh quote</TooltipContent>
    </Tooltip>
  );
}
