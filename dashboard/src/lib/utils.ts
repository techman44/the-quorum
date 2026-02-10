import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function cronToHuman(cron: string): string {
  const parts = cron.split(' ');
  if (parts.length < 5) return cron;

  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

  // */N * * * * -> Every N min
  if (minute.startsWith('*/')) {
    const n = minute.slice(2);
    return `Every ${n} min`;
  }

  // 0 */N * * * -> Every N hours
  if (minute === '0' && hour.startsWith('*/')) {
    const n = hour.slice(2);
    return n === '1' ? 'Every hour' : `Every ${n} hours`;
  }

  // 0 * * * * -> Every hour
  if (minute === '0' && hour === '*') {
    return 'Every hour';
  }

  // 0 N * * * -> Daily atNam/pm
  if (minute === '0' && !hour.includes('*') && !hour.includes('/') && dayOfMonth === '*' && dayOfWeek === '*') {
    const h = parseInt(hour, 10);
    if (h === 0) return 'Daily 12am';
    if (h < 12) return `Daily ${h}am`;
    if (h === 12) return 'Daily 12pm';
    return `Daily ${h - 12}pm`;
  }

  return cron;
}
