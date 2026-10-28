import { cn } from '../../lib/utils';

/** Loading placeholder. Used instead of empty screens while the feed hydrates. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-xl bg-white/[0.07]', className)} {...props} />;
}
