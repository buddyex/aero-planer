import { motion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

export const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 100,
    },
  },
};

interface AnimatedGridProps {
  children: ReactNode;
  className?: string;
}

export function AnimatedGrid({ children, className }: AnimatedGridProps) {
  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}

interface AnimatedGridItemProps extends HTMLMotionProps<'div'> {
  children: ReactNode;
  className?: string;
  hoverLift?: boolean;
}

export function AnimatedGridItem({
  children,
  className,
  hoverLift = true,
  ...rest
}: AnimatedGridItemProps) {
  return (
    <motion.div
      className={cn(className)}
      variants={itemVariants}
      whileHover={hoverLift ? { y: -4, transition: { duration: 0.2 } } : undefined}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
