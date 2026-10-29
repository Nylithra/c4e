import { cn } from '../../lib/utils';

/**
 * Yükleniyor yer tutucusu.
 *
 * `animate-pulse` yerine soldan sağa geçen bir parıltı kullanıyor. Yanıp sönen bir blok
 * "bir sorun var" gibi okunuyor; parıltı ise YÖN taşıyor ve "veri geliyor" diyor — aynı
 * sebeple içeriğin okunma yönünde ilerliyor. Hareket azaltma tercihinde parıltı durur,
 * yer tutucu durmaya devam eder.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('c4e-skeleton', className)} {...props} />;
}
