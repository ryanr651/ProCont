import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function Logo({ className, size = "md" }: LogoProps) {
  const sizeClasses = {
    sm: "text-xl",
    md: "text-3xl",
    lg: "text-5xl"
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/30">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="w-6 h-6 text-primary-foreground"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7 16l4-8 4 4 6-10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary to-secondary blur-lg opacity-50" />
      </div>
      <span className={cn("font-display font-bold gradient-text", sizeClasses[size])}>
        ProCont
      </span>
    </div>
  );
}
