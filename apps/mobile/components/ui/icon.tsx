import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { cssInterop } from 'nativewind';
import * as React from 'react';
import type { IconType } from 'react-icons';
import type { StyleProp, ViewStyle } from 'react-native';

// react-native-reusables' Icon, for react-icons instead of lucide (CLAUDE.md). react-icons'
// typings describe DOM <svg> props; on the phone lib/icons/gen-icon.ts draws the icon with
// react-native-svg and reads `size`, `color`, `style` and `title`.

type IconProps = {
  as: IconType;
  className?: string;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  /** Spoken label; leave out for decorative icons. */
  title?: string;
};

function IconImpl({ as: IconComponent, size, color, style, title }: IconProps) {
  return <IconComponent size={size} color={color} title={title} style={style as never} />;
}

cssInterop(IconImpl, {
  className: {
    target: 'style',
    nativeStyleToProp: {
      height: 'size',
      width: 'size',
    },
  },
});

/**
 * A react-icons icon with NativeWind classes, e.g.
 * `<Icon as={LuScanLine} className="size-5 text-primary" />`. Text colour classes set its colour.
 */
function Icon({ as: IconComponent, className, size = 16, ...props }: IconProps) {
  const textClass = React.useContext(TextClassContext);
  return (
    <IconImpl
      as={IconComponent}
      className={cn('text-foreground', textClass, className)}
      size={size}
      {...props}
    />
  );
}

export { Icon };
