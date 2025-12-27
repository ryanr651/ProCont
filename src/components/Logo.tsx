import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function Logo({ className, size = "md" }: LogoProps) {
  const sizeConfig = {
    sm: { icon: 28, text: "text-lg" },
    md: { icon: 40, text: "text-2xl" },
    lg: { icon: 56, text: "text-4xl" }
  };

  const config = sizeConfig[size];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Icon - Ascending arrow with flowing tech curves */}
      <svg
        width={config.icon}
        height={config.icon}
        viewBox="0 0 64 64"
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
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
          <linearGradient id="gradient-cyan" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>

        {/* Main ascending arrow */}
        <path
          d="M32 4L40 16H34V28C34 28 38 24 44 28C50 32 48 40 48 40L34 40V16H30V40L16 40C16 40 14 32 20 28C26 24 30 28 30 28V16H24L32 4Z"
          fill="url(#gradient-magenta)"
        />

        {/* First flowing curve (purple) */}
        <path
          d="M24 32C24 32 20 36 20 44C20 52 28 56 28 56L24 60C24 60 12 54 12 44C12 34 24 32 24 32Z"
          fill="url(#gradient-purple)"
        />

        {/* Second flowing curve (blue) */}
        <path
          d="M18 38C18 38 14 44 16 52C18 58 26 60 26 60L22 64C22 64 10 60 10 50C10 40 18 38 18 38Z"
          fill="url(#gradient-blue)"
        />

        {/* Third flowing curve (cyan) */}
        <path
          d="M12 44C12 44 8 50 10 56C11 60 16 62 16 62L12 64C12 64 4 60 4 54C4 48 12 44 12 44Z"
          fill="url(#gradient-cyan)"
        />

        {/* Tech circuit dots */}
        <circle cx="8" cy="58" r="2" fill="url(#gradient-cyan)" />
        <circle cx="4" cy="52" r="1.5" fill="url(#gradient-blue)" />
        <circle cx="10" cy="62" r="1" fill="url(#gradient-cyan)" />
        
        {/* Connection lines */}
        <path
          d="M8 58L4 52M8 58L10 62"
          stroke="url(#gradient-cyan)"
          strokeWidth="1"
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
