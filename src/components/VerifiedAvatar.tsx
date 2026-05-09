import { Check } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

type VerifiedAvatarProps = {
  src?: string;
  alt: string;
  fallback: string;
  verified?: boolean;
  className?: string;
  fallbackClassName?: string;
};

const VerifiedAvatar = ({
  src,
  alt,
  fallback,
  verified = false,
  className,
  fallbackClassName,
}: VerifiedAvatarProps) => (
  <div className="relative inline-flex">
    <Avatar className={className}>
      <AvatarImage src={src} alt={alt} />
      <AvatarFallback className={fallbackClassName}>{fallback}</AvatarFallback>
    </Avatar>
    {verified && (
      <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-sky-500 text-white shadow-sm">
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    )}
  </div>
);

export default VerifiedAvatar;
