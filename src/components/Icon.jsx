import * as LucideIcons from 'lucide-react';

export default function Icon({ name, size = 18, className = '' }) {
  const IconComponent = LucideIcons[name] || LucideIcons.HelpCircle;

  return (
    <span className={`inline-flex items-center justify-center flex-shrink-0 ${className}`}>
      <IconComponent size={size} />
    </span>
  );
}
