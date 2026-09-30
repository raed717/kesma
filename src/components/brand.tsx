import Link from "next/link";

/** Logo: a plot split into lots. */
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight">
      <svg viewBox="0 0 24 24" className="size-6 text-primary" aria-hidden>
        <path d="M3 5l8-2 10 3-2 14-12 1-4-8z" fill="currentColor" opacity="0.18" />
        <path
          d="M3 5l8-2 10 3-2 14-12 1-4-8zM11 3l-1 18M3 13l17-2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      <span>KESMA</span>
    </Link>
  );
}
