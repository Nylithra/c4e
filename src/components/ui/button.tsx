import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

/**
 * shadcn/ui Button, tuned to Code4Ever's existing visual language:
 * compact heights, extra-bold micro typography and the pill radius the feed already uses.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-bold transition-all cursor-pointer select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]",
  {
    variants: {
      variant: {
        // Birincil eylem Aurora'nin tek gradyani. `brand-gradient` ayni rengi tasiyordu
        // ama kendi golgesi ve gecisiyle; iki ayri tanimin zamanla birbirinden kaymasi
        // kacinilmazdi.
        default: 'c4e-btn',
        brand: 'c4e-btn',
        neutral: 'bg-zinc-100 text-zinc-950 hover:bg-white shadow-md',
        primary: 'bg-blue-600 text-white hover:bg-blue-500 shadow-md shadow-blue-600/20',
        community: 'bg-purple-600 text-white hover:bg-purple-500 shadow-lg shadow-purple-600/20',
        spark:
          'bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950 hover:from-amber-400 hover:to-amber-500 shadow-lg shadow-amber-500/20',
        secondary: 'c4e-ghost',
        outline: 'c4e-ghost',
        ghost: 'text-zinc-400 hover:text-white hover:bg-white/[0.06]',
        destructive: 'bg-red-600 text-white hover:bg-red-500 shadow-md shadow-red-600/20',
        destructiveGhost: 'text-zinc-400 hover:text-red-400 hover:bg-red-500/10',
        link: 'text-blue-400 underline-offset-4 hover:underline'
      },
      size: {
        xs: 'h-7 px-2.5 rounded-lg text-[11px] [&_svg]:size-3.5',
        sm: 'h-8 px-3 rounded-xl text-[11px] [&_svg]:size-3.5',
        default: 'h-9 px-4 rounded-xl text-xs [&_svg]:size-4',
        lg: 'h-11 px-6 rounded-2xl text-sm [&_svg]:size-4',
        icon: 'h-8 w-8 rounded-lg [&_svg]:size-4',
        iconSm: 'h-7 w-7 rounded-lg [&_svg]:size-3.5'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        // Buttons inside forms default to submit, which silently submits the composer.
        type={asChild ? undefined : type || 'button'}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
