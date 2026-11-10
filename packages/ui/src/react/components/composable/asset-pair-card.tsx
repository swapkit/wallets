"use client";

import { ArrowDownUpIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";

export function AssetPairCard({
  top,
  bottom,
  onFlip,
  isFlipDisabled,
}: {
  top: ReactNode;
  bottom: ReactNode;
  onFlip: () => void;
  isFlipDisabled?: boolean;
}) {
  return (
    <Card>
      <CardContent className="sk-ui-grid sk-ui-gap-6">
        <div className="sk-ui-space-y-4">
          <div className="sk-ui-grid sk-ui-gap-4">
            {top}

            <div className="sk-ui--my-4 sk-ui-flex sk-ui-items-center sk-ui-space-x-4">
              <span className="sk-ui-h-px sk-ui-w-full sk-ui-bg-border" />

              <Button
                className="sk-ui-size-10 sk-ui-shrink-0 sk-ui-rounded-full"
                disabled={isFlipDisabled}
                onClick={onFlip}
                size="unstyled"
                variant="tertiary">
                <ArrowDownUpIcon className="sk-ui-size-6" />
              </Button>

              <span className="sk-ui-h-px sk-ui-w-full sk-ui-bg-border" />
            </div>

            {bottom}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
