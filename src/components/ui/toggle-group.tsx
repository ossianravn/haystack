import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup as Group } from '@base-ui/react/toggle-group';
import { cn } from '@/lib/utils';

// Adapted from shadcn's Base UI toggle group to the extension's flat controls.
export function ToggleGroup({ className, ...props }: Group.Props) {
  return <Group data-slot="toggle-group" className={cn('flex w-full gap-2', className)} {...props} />;
}

export function ToggleGroupItem({ className, ...props }: Toggle.Props) {
  return <Toggle data-slot="toggle-group-item" className={cn(
    'flex flex-1 items-center justify-center gap-2 rounded-[2px] border border-input px-3 py-3 text-sm font-medium text-foreground',
    'hover:bg-muted data-pressed:border-primary data-pressed:bg-primary data-pressed:text-primary-foreground',
    'focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring disabled:opacity-50', className,
  )} {...props} />;
}
