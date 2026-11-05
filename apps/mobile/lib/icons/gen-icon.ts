/**
 * react-icons for React Native. Metro sends react-icons' own `lib` here (react-icons-native.js),
 * so every icon (`import { LuX } from 'react-icons/lu'`) is drawn with react-native-svg instead
 * of DOM <svg>. The exports mirror react-icons' `lib`: GenIcon, IconBase, IconContext.
 *
 * Icons take `size` (default 24), `color` (default: the `color` of `style`, then IconContext)
 * and `title` (read out by screen readers). Use components/ui/icon.tsx to style them with
 * classes.
 */
import * as React from 'react';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  FeColorMatrix,
  FeGaussianBlur,
  FeMerge,
  FeMergeNode,
  FeOffset,
  Filter,
  G,
  Line,
  LinearGradient,
  Mask,
  Path,
  Polygon,
  Polyline,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

/** The icon data react-icons generates: an SVG element tree. */
export interface IconTree {
  tag: string;
  attr: Record<string, string>;
  child: IconTree[];
}

export interface IconContextValue {
  color?: string;
  size?: string | number;
  className?: string;
  style?: unknown;
  attr?: Record<string, string>;
}

export interface IconBaseProps {
  size?: string | number;
  color?: string;
  title?: string;
  style?: unknown;
  children?: React.ReactNode;
  attr?: Record<string, string>;
  [prop: string]: unknown;
}

export const DefaultContext: IconContextValue = {
  color: undefined,
  size: undefined,
  className: undefined,
  style: undefined,
  attr: undefined,
};

export const IconContext = React.createContext<IconContextValue>(DefaultContext);

export const DEFAULT_ICON_SIZE = 24;

// Every tag found in react-icons 5.7 (50,939 icons), mapped to react-native-svg.
const ELEMENTS: Record<string, React.ElementType> = {
  circle: Circle,
  clipPath: ClipPath,
  defs: Defs,
  ellipse: Ellipse,
  feColorMatrix: FeColorMatrix,
  feGaussianBlur: FeGaussianBlur,
  feMerge: FeMerge,
  feMergeNode: FeMergeNode,
  feOffset: FeOffset,
  filter: Filter,
  g: G,
  line: Line,
  linearGradient: LinearGradient,
  mask: Mask,
  path: Path,
  polygon: Polygon,
  polyline: Polyline,
  radialGradient: RadialGradient,
  rect: Rect,
  stop: Stop,
};

// Root <svg> attributes react-native-svg understands; the rest (version, role, xmlns, x, y, id,
// enable-background ...) only matter in a browser.
const ROOT_ATTRIBUTES = new Set([
  'viewBox',
  'preserveAspectRatio',
  'fill',
  'fillOpacity',
  'fillRule',
  'clipRule',
  'stroke',
  'strokeWidth',
  'strokeOpacity',
  'strokeLinecap',
  'strokeLinejoin',
  'strokeMiterlimit',
  'strokeDasharray',
  'strokeDashoffset',
  'opacity',
]);

// Child attributes that mean nothing to react-native-svg.
const DROPPED_ATTRIBUTES = new Set([
  'class',
  'className',
  'style',
  'role',
  'version',
  'xmlns',
  'xmlnsXlink',
  'baseProfile',
  'enableBackground',
  't',
  'focusable',
]);

/** `stroke-width` → `strokeWidth`, `xlink:href` → `xlinkHref`. */
export const toCamelCase = (name: string): string =>
  name.replace(/[-:]+([a-zA-Z])/g, (_, c: string) => c.toUpperCase());

/** Converts one element's attributes for react-native-svg. */
export function svgAttributes(
  attr: Record<string, string> | undefined,
  root = false,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!attr) return out;
  for (const [key, value] of Object.entries(attr)) {
    if (key.startsWith('aria-') || key.startsWith('data-')) continue;
    const name = toCamelCase(key);
    if (root ? !ROOT_ATTRIBUTES.has(name) : DROPPED_ATTRIBUTES.has(name)) continue;
    out[name] = value;
  }
  return out;
}

/** Converts an icon's child elements. Tags react-native-svg cannot draw are skipped. */
export function treeToElements(
  nodes: readonly IconTree[] | undefined,
  key = '',
): React.ReactElement[] {
  if (!nodes) return [];
  const out: React.ReactElement[] = [];
  nodes.forEach((node, i) => {
    const component = ELEMENTS[node.tag];
    if (!component) return;
    out.push(
      React.createElement(
        component,
        { key: `${key}${i}`, ...svgAttributes(node.attr) },
        ...treeToElements(node.child, `${key}${i}-`),
      ),
    );
  });
  return out;
}

/** Flattens a React Native style (objects, nested arrays, falsy entries) without React Native. */
function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle));
  return style && typeof style === 'object' ? { ...(style as Record<string, unknown>) } : {};
}

// Svg's own prop types cannot describe the attributes copied from icon data.
const SvgRoot = Svg as React.ElementType;

/** The <Svg> element for an icon. Pure, so it can be unit tested. */
export function renderIcon(props: IconBaseProps, context: IconContextValue): React.ReactElement {
  const { attr, size, color, title, style, children, className: _className, ...rest } = props;
  const flat = flattenStyle([context.style, style]);
  const fromStyle = typeof flat.color === 'string' ? flat.color : undefined;
  const computedSize = size ?? context.size ?? DEFAULT_ICON_SIZE;
  return React.createElement(
    SvgRoot,
    {
      // react-icons' defaults, then the icon's own attributes.
      stroke: 'currentColor',
      fill: 'currentColor',
      strokeWidth: '0',
      ...svgAttributes(context.attr, true),
      ...svgAttributes(attr, true),
      ...rest,
      width: computedSize,
      height: computedSize,
      color: color ?? fromStyle ?? context.color,
      style,
      ...(title ? { accessible: true, accessibilityLabel: title, accessibilityRole: 'image' } : {}),
    },
    children as React.ReactNode,
  );
}

export function IconBase(props: IconBaseProps): React.ReactElement {
  return React.createElement(IconContext.Consumer, {
    children: (context: IconContextValue) => renderIcon(props, context),
  });
}

/** What each react-icons icon calls: `GenIcon(tree)(props)`. */
export function GenIcon(data: IconTree): (props: IconBaseProps) => React.ReactElement {
  return function Icon(props: IconBaseProps) {
    return React.createElement(
      IconBase,
      { attr: { ...data.attr }, ...props },
      ...treeToElements(data.child),
    );
  };
}
