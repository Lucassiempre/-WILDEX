import { CheckCircle2, Info } from "lucide-react";

type ToastProps = {
  message: string;
  tone?: "success" | "info";
};

export function Toast({ message, tone = "info" }: ToastProps) {
  const Icon = tone === "success" ? CheckCircle2 : Info;

  return (
    <div className="absolute left-4 right-4 top-20 z-[60] flex animate-pop items-start gap-3 rounded-3xl border border-forest/10 bg-white p-4 text-forest shadow-glow">
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${tone === "success" ? "bg-gold/30" : "bg-moss/45"}`}>
        <Icon size={20} aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold leading-6">{message}</p>
    </div>
  );
}
