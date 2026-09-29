import { enabledSocialProviders } from "@/auth";
import { socialSignIn } from "./actions";

export function SocialButtons({ callbackUrl }: { callbackUrl?: string }) {
  const { google, apple } = enabledSocialProviders;
  if (!google && !apple) return null;
  return (
    <div className="space-y-2">
      {apple && (
        <form action={socialSignIn}>
          <input type="hidden" name="provider" value="apple" />
          <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
          <button className="btn w-full bg-black text-white hover:bg-slate-800">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M16.37 12.62c.02 2.46 2.16 3.28 2.18 3.29-.02.06-.34 1.17-1.13 2.32-.68.99-1.39 1.98-2.5 2-1.1.02-1.45-.65-2.7-.65-1.26 0-1.65.63-2.69.67-1.08.04-1.9-1.07-2.58-2.06-1.4-2.02-2.47-5.71-1.03-8.2.71-1.24 1.99-2.02 3.38-2.04 1.05-.02 2.05.71 2.7.71.64 0 1.86-.88 3.13-.75.53.02 2.03.21 2.99 1.62-.08.05-1.78 1.04-1.76 3.09M14.3 5.36c.57-.69.96-1.65.85-2.61-.82.03-1.82.55-2.41 1.24-.53.61-.99 1.59-.87 2.53.92.07 1.85-.47 2.43-1.16" />
            </svg>
            Mit Apple anmelden
          </button>
        </form>
      )}
      {google && (
        <form action={socialSignIn}>
          <input type="hidden" name="provider" value="google" />
          <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
          <button className="btn-secondary w-full">
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
              <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.07-1.1-.16-1.6z" />
            </svg>
            Mit Google anmelden
          </button>
        </form>
      )}
      <div className="relative py-2 text-center text-xs text-slate-400">
        <span className="relative z-10 bg-white px-2">oder mit E-Mail</span>
        <div className="absolute inset-x-0 top-1/2 border-t border-slate-200" />
      </div>
    </div>
  );
}
