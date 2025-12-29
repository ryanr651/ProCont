import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function Logo({ className, size = "md" }: LogoProps) {
  const sizeConfig = {
    sm: { icon: 28, text: "text-lg", gap: "gap-1" },
    md: { icon: 38, text: "text-2xl", gap: "gap-1.5" },
    lg: { icon: 52, text: "text-4xl", gap: "gap-2" }
  };

  const config = sizeConfig[size];

  return (
    <div className={cn("flex items-center", config.gap, className)}>
      {/* Icon - Ascending arrows with flowing tech curves */}
      <svg
        width={config.icon}
        height={config.icon}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        <defs>
          <linearGradient id="gradient-magenta" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#9333ea" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
          <linearGradient id="gradient-purple" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          <linearGradient id="gradient-blue" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <linearGradient id="gradient-cyan" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>

        {/* Left flowing curves */}
        {/* First curve - purple/magenta */}
        <path
          d="M18 75 C18 75, 12 55, 22 40 C32 25, 42 30, 42 30"
          stroke="url(#gradient-magenta)"
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
        />
        
        {/* Second curve - purple */}
        <path
          d="M28 80 C28 80, 22 60, 32 45 C42 30, 52 35, 52 35"
          stroke="url(#gradient-purple)"
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
        />
        
        {/* Third curve - blue */}
        <path
          d="M38 85 C38 85, 32 65, 42 50 C52 35, 62 40, 62 40"
          stroke="url(#gradient-blue)"
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
        />

        {/* Main ascending arrow - cyan */}
        <path
          d="M72 70 L72 35 L60 35 L75 15 L90 35 L78 35 L78 70"
          fill="url(#gradient-cyan)"
        />

        {/* Secondary arrow - magenta */}
        <path
          d="M55 75 L55 50 L47 50 L58 35 L69 50 L61 50 L61 75"
          fill="url(#gradient-magenta)"
        />

        {/* Circuit dots */}
        <circle cx="15" cy="82" r="3" fill="#94a3b8" />
        <circle cx="25" cy="88" r="2.5" fill="#94a3b8" />
        <circle cx="35" cy="92" r="2" fill="#94a3b8" />
        <circle cx="45" cy="88" r="2.5" fill="#94a3b8" />
        <circle cx="55" cy="84" r="2" fill="#94a3b8" />
        
        {/* Circuit lines */}
        <path
          d="M15 82 L15 90 M25 88 L25 94 M35 92 L35 96 M45 88 L45 94 M55 84 L55 90"
          stroke="#94a3b8"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>

      {/* Text */}
      <span className={cn(
        "font-display font-bold tracking-tight",
        config.text
      )}>
        <span className="text-foreground">Pro</span>
        <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Cont</span>
      </span>
    </div>
  );
}
