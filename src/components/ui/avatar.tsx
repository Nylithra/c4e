import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from '../../lib/utils';

/**
 * Avatar with a graceful fallback: broken or missing profile pictures show initials instead
 * of the browser's broken-image icon (a long-standing rough edge in the feed).
 */
const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-white/[0.04]', className)}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image ref={ref} className={cn('aspect-square h-full w-full object-cover', className)} {...props} />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      'flex h-full w-full items-center justify-center rounded-full bg-white/[0.07] text-xs font-black uppercase text-zinc-300',
      className
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

/** Convenience wrapper: the shape used all over the feed (image + initials fallback). */
export const UserAvatar: React.FC<{
  src?: string | null;
  name?: string | null;
  className?: string;
  onClick?: () => void;
  title?: string;
}> = ({ src, name, className, onClick, title }) => {
  // "Dev User" -> "DU", "nylithra" -> "NY"
  const cleanName = (name || '?').trim().replace(/^@/, '');
  const words = cleanName.split(/[\s_.-]+/).filter(Boolean);
  const initials =
    words.length > 1 ? `${words[0][0]}${words[1][0]}` : cleanName.slice(0, 2);
  const interactive = typeof onClick === 'function';
  // Never hand an empty string to <img src>: browsers re-request the whole page for it
  // and React warns about it on every render.
  const safeSrc = typeof src === 'string' && src.trim() ? src : null;

  const content = (
    <Avatar className={cn(interactive && 'cursor-pointer transition-transform hover:scale-[1.04]', className)}>
      {safeSrc ? <AvatarImage src={safeSrc} alt={name || ''} /> : null}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );

  if (!interactive) return content;

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title || (name ? `${name} profilini aç` : 'Profili aç')}
      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
    >
      {content}
    </button>
  );
};

export { Avatar, AvatarImage, AvatarFallback };
