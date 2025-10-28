import { cn } from "../lib/utils.js";

interface LogoProps {
  className?: string;
  children?: React.ReactNode;
}

function LogoRoot({ className, children }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>{children}</div>
  );
}

interface LogoIconProps {
  className?: string;
  src?: string | null;
}

function LogoIcon({ className }: LogoIconProps) {
  return (
    <svg
      width={368}
      height={368}
      viewBox="0 0 368 368"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-5", className)}
    >
      <title>FrontDesk logo</title>
      <path
        d="M288.263 168H78.936L67.65 104h231.898l-11.285 64zM252.998 368H114.201l-11.285-64h161.367l-11.285 64z"
        fill="currentColor"
      />
      <path fill="currentColor" d="M0 204H368V268H0z" />
      <circle cx={184} cy={38} r={38} fill="currentColor" />
    </svg>
  );
}

function LogoSeparator({ className }: { className?: string }) {
  return (
    <svg
      data-testid="geist-icon"
      height="16"
      stroke-linejoin="round"
      viewBox="0 0 16 16"
      width="16"
      className={cn("size-5", className)}
    >
      <title>Logo Icon</title>
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M4.01526 15.3939L4.3107 14.7046L10.3107 0.704556L10.6061 0.0151978L11.9849 0.606077L11.6894 1.29544L5.68942 15.2954L5.39398 15.9848L4.01526 15.3939Z"
        fill="rgba(255, 255, 255, 0.14)"
      ></path>
    </svg>
  );
}

function LogoText({ className, children }: LogoProps) {
  return (
    <span className={cn("text-lg font-medium", className)}>
      {children || "FrontDesk"}
    </span>
  );
}

export const Logo = Object.assign(LogoRoot, {
  Icon: LogoIcon,
  Text: LogoText,
  Separator: LogoSeparator,
});
