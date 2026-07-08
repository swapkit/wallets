import { cn } from "../../lib/utils";

interface SwapKitLogoProps extends React.SVGProps<SVGSVGElement> {
  color?: string;
}

export function SwapKitLogo({ className, color = "currentColor", ...props }: SwapKitLogoProps) {
  return (
    <svg
      className={cn("sk-ui-w-8 sk-ui-h-8", className)}
      fill={color}
      viewBox="0 0 74.33 86.52"
      xmlns="http://www.w3.org/2000/svg"
      {...props}>
      <title>SwapKit</title>
      <path d="M24.68,0C11.07,0,0,11.07,0,24.68h12.39c0-6.78,5.51-12.29,12.29-12.29h49.65V0H24.68Z" />
      <path d="M12.39,37.07h49.56v12.39H12.39v-12.39H0v24.78h61.94c0,6.78-5.51,12.29-12.29,12.29H0v12.39h49.65c13.61,0,24.68-11.07,24.68-24.68h-12.39v-12.39h12.39v-24.78H12.39v12.39Z" />
    </svg>
  );
}
