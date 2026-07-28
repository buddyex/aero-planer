import { useEffect, useRef } from 'react';
import { useMotionValue, useSpring } from 'framer-motion';
import { cn } from '../../utils/cn';

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}

export function AnimatedNumber({
  value,
  decimals = 0,
  suffix = '',
  className,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { stiffness: 80, damping: 20 });

  useEffect(() => {
    motionValue.set(value);
  }, [motionValue, value]);

  useEffect(() => {
    const format = (latest: number) =>
      latest.toLocaleString('ru-RU', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }) + suffix;

    if (ref.current) {
      ref.current.textContent = format(motionValue.get());
    }

    const unsubscribe = spring.on('change', (latest) => {
      if (ref.current) {
        ref.current.textContent = format(latest);
      }
    });

    return unsubscribe;
  }, [spring, motionValue, decimals, suffix]);

  return <span ref={ref} className={cn('tabular-nums', className)} />;
}
