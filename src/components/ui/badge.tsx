import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[10px] font-bold font-mono transition-colors',
  {
    variants: {
      variant: {
        default: 'border-white/[0.12] bg-white/[0.07] text-zinc-300',
        outline: 'border-white/[0.07] bg-transparent text-zinc-400',
        community: 'border-purple-500/25 bg-purple-500/10 text-purple-300',
        category: 'border-blue-500/25 bg-blue-500/10 text-blue-300',
        spark: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
        danger: 'border-red-500/30 bg-red-500/10 text-red-300',
        private: 'border-zinc-500/30 bg-zinc-100/10 text-zinc-200'
      }
    },
    defaultVariants: { variant: 'default' }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
