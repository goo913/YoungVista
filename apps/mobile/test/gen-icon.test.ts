/**
 * The react-icons → react-native-svg adapter. vitest.config.mts redirects react-icons' `lib` to
 * the adapter exactly as metro.config.js does, so the real icon packs are tested here.
 * react-native-svg is replaced by plain host components named after its exports.
 */
import * as React from 'react';
import { FcGoogle } from 'react-icons/fc';
import { LuScanLine } from 'react-icons/lu';
import { describe, expect, it, vi } from 'vitest';
import {
  DefaultContext,
  GenIcon,
  IconBase,
  renderIcon,
  svgAttributes,
  toCamelCase,
  type IconBaseProps,
  type IconTree,
} from '@/lib/icons/gen-icon';

vi.mock('react-native-svg', () => {
  const names = [
    'Svg',
    'Circle',
    'ClipPath',
    'Defs',
    'Ellipse',
    'FeColorMatrix',
    'FeGaussianBlur',
    'FeMerge',
    'FeMergeNode',
    'FeOffset',
    'Filter',
    'G',
    'Line',
    'LinearGradient',
    'Mask',
    'Path',
    'Polygon',
    'Polyline',
    'RadialGradient',
    'Rect',
    'Stop',
  ];
  return { ...Object.fromEntries(names.map((n) => [n, `Svg.${n}`])), default: 'Svg.Svg' };
});

type Element = React.ReactElement<Record<string, unknown>>;

/** Renders an icon element down to its <Svg> element, as React would. */
function toSvg(icon: React.ReactNode, context = DefaultContext): Element {
  const el = icon as Element;
  expect(el.type).toBe(IconBase);
  const consumer = IconBase(el.props as IconBaseProps) as Element;
  const render = consumer.props.children as (c: typeof DefaultContext) => Element;
  return render(context);
}

const childrenOf = (el: Element): Element[] =>
  React.Children.toArray(el.props.children as React.ReactNode) as Element[];

describe('react-icons on React Native', () => {
  it('draws a real Lucide icon with react-native-svg elements', () => {
    const svg = toSvg(LuScanLine({ size: 32, color: '#ff0000' }));
    expect(svg.type).toBe('Svg.Svg');
    expect(svg.props).toMatchObject({
      width: 32,
      height: 32,
      color: '#ff0000',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    });
    const children = childrenOf(svg);
    expect(children.length).toBeGreaterThan(1);
    for (const child of children) {
      expect(['Svg.Path', 'Svg.Line', 'Svg.Rect', 'Svg.Circle', 'Svg.Polyline']).toContain(
        child.type,
      );
    }
    expect(children.some((c) => c.type === 'Svg.Path' && typeof c.props.d === 'string')).toBe(true);
  });

  it('keeps the colours of multi-colour icons (Google logo)', () => {
    const svg = toSvg(FcGoogle({ size: 18 }));
    const fills = childrenOf(svg).map((c) => c.props.fill);
    expect(fills).toEqual(expect.arrayContaining(['#FFC107', '#FF3D00', '#4CAF50', '#1976D2']));
    expect(svg.props.version).toBeUndefined();
  });

  it('takes the colour from style when no color prop is given, then from context', () => {
    const fromStyle = toSvg(LuScanLine({ style: [{ marginLeft: 4 }, { color: 'blue' }] as never }));
    expect(fromStyle.props.color).toBe('blue');
    expect(fromStyle.props.width).toBe(24);
    const fromContext = toSvg(LuScanLine({}), { ...DefaultContext, color: 'green', size: 20 });
    expect(fromContext.props).toMatchObject({ color: 'green', width: 20, height: 20 });
  });

  it('gives the icon a spoken label when it has a title', () => {
    const svg = toSvg(LuScanLine({ title: 'Scan' }));
    expect(svg.props).toMatchObject({ accessible: true, accessibilityLabel: 'Scan' });
  });

  it('maps tags and attributes, drops what React Native cannot use', () => {
    const tree: IconTree = {
      tag: 'svg',
      attr: { viewBox: '0 0 10 10', version: '1.1', role: 'img', x: '0', 'stroke-width': '3' },
      child: [
        {
          tag: 'g',
          attr: { 'fill-rule': 'evenodd', class: 'x', style: 'a:b', 'aria-hidden': 'true' },
          child: [
            { tag: 'circle', attr: { cx: '5', cy: '5', r: '4' }, child: [] },
            { tag: 'title', attr: {}, child: [] },
          ],
        },
        { tag: 'blink', attr: {}, child: [] },
      ],
    };
    const svg = toSvg(GenIcon(tree)({}));
    expect(svg.props).toMatchObject({ viewBox: '0 0 10 10', strokeWidth: '3' });
    expect(svg.props).not.toHaveProperty('version');
    expect(svg.props).not.toHaveProperty('x');
    const [group] = childrenOf(svg);
    expect(childrenOf(svg)).toHaveLength(1);
    expect(group?.type).toBe('Svg.G');
    expect(group?.props).toEqual(expect.objectContaining({ fillRule: 'evenodd' }));
    expect(group?.props).not.toHaveProperty('class');
    expect(group?.props).not.toHaveProperty('ariaHidden');
    const inner = childrenOf(group!);
    expect(inner.map((c) => c.type)).toEqual(['Svg.Circle']);
    expect(inner[0]?.props).toMatchObject({ cx: '5', cy: '5', r: '4' });
  });

  it('converts attribute names', () => {
    expect(toCamelCase('stroke-linecap')).toBe('strokeLinecap');
    expect(toCamelCase('xlink:href')).toBe('xlinkHref');
    expect(svgAttributes({ 'data-x': '1', opacity: '.5' })).toEqual({ opacity: '.5' });
  });

  it('renders the same element when called through IconBase directly', () => {
    const svg = renderIcon({ attr: { viewBox: '0 0 1 1' }, size: 10 }, DefaultContext);
    expect(svg.props).toMatchObject({
      width: 10,
      height: 10,
      viewBox: '0 0 1 1',
      fill: 'currentColor',
    });
  });
});
