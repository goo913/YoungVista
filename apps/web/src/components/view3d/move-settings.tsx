/**
 * The 3D view's ⚙: how a person moves (the keys as a game does, or the mouse alone), then their
 * walk: height (the eyes follow), field of view, mouse speed, view bobbing and the hand. Ported
 * from the team's closet designer (TAKEOFFPRIME, branch avena/closet-ux: `WalkSettingsMenu.jsx`
 * and the Showroom's settings in `ShowroomChrome.jsx`). Flying reads only the field of view and
 * the mouse.
 */
import {
  SKIN_TONES,
  WALK_FOV,
  WALK_HEIGHT_CM,
  WALK_LOOK,
  feetInches,
  type SkinTone,
} from '@youngvista/core';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { MoveControls, MovePrefs } from '@/lib/move-prefs';
import { cn } from '@/lib/utils';

export function MoveSettings({
  prefs,
  onChange,
  flying,
}: {
  prefs: MovePrefs;
  onChange: (change: Partial<MovePrefs>) => void;
  /** Only what flying with the keys reads: the field of view and the mouse. */
  flying: boolean;
}) {
  const { heightCm, fov, look, bob, hand, skin } = prefs;
  const usual =
    (flying || (heightCm === WALK_HEIGHT_CM.default && bob && !hand)) &&
    fov === WALK_FOV.default &&
    look === WALK_LOOK.default;
  return (
    <div className="grid gap-4" aria-label="Settings">
      <div className="grid gap-2">
        <p className="font-medium">Moving around</p>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={prefs.controls}
          onValueChange={(v) => {
            if (v === 'keys' || v === 'mouse') onChange({ controls: v as MoveControls });
          }}
          aria-label="Moving around"
          className="w-full"
        >
          <ToggleGroupItem
            value="keys"
            className="flex-1"
            title="As in a game: click the room and the mouse looks around, W A S D move"
          >
            Keyboard &amp; mouse
          </ToggleGroupItem>
          <ToggleGroupItem
            value="mouse"
            className="flex-1"
            title="The mouse alone (or a finger): drag to turn, scroll to move"
          >
            Mouse only
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="grid gap-3">
        <p className="font-medium">{flying ? 'Flying' : 'Walk'}</p>
        {!flying ? (
          <Row
            label="Your height"
            value={`${heightCm} cm · ${feetInches(heightCm)}`}
            min={WALK_HEIGHT_CM.min}
            max={WALK_HEIGHT_CM.max}
            step={1}
            current={heightCm}
            onValue={(v) => onChange({ heightCm: v })}
          />
        ) : null}
        <Row
          label="Field of view"
          value={
            fov === WALK_FOV.default
              ? `${fov}° · Standard`
              : fov > WALK_FOV.wide
                ? `${fov}° · Wide`
                : `${fov}°`
          }
          min={WALK_FOV.min}
          max={WALK_FOV.max}
          step={1}
          current={fov}
          onValue={(v) => onChange({ fov: v })}
        />
        <Row
          label="Mouse speed"
          value={`${Math.round(look * 100)}%`}
          min={WALK_LOOK.min}
          max={WALK_LOOK.max}
          step={0.05}
          current={look}
          onValue={(v) => onChange({ look: Number(v.toFixed(2)) })}
        />
        {!flying ? (
          <>
            <SwitchRow
              id="move-bob"
              label="View bobbing"
              checked={bob}
              onChecked={(on) => onChange({ bob: on })}
            />
            <SwitchRow
              id="move-hand"
              label="Show my hand"
              hint="H"
              checked={hand}
              onChecked={(on) => onChange({ hand: on })}
            />
            {hand ? (
              <div role="group" aria-label="Skin tone" className="flex gap-2">
                {SKIN_TONES.map((t: SkinTone) => (
                  <button
                    key={t.id}
                    type="button"
                    className={cn(
                      'size-7 rounded-full border-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      skin === t.id ? 'border-primary' : 'border-transparent',
                    )}
                    style={{ background: t.hex }}
                    title={t.name}
                    aria-label={`Skin tone: ${t.name}`}
                    aria-pressed={skin === t.id}
                    onClick={() => onChange({ skin: t.id })}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : null}
        {!usual ? (
          <Button
            variant="link"
            size="sm"
            className="h-auto w-fit px-0"
            onClick={() =>
              onChange(
                flying
                  ? { fov: WALK_FOV.default, look: WALK_LOOK.default }
                  : {
                      fov: WALK_FOV.default,
                      look: WALK_LOOK.default,
                      heightCm: WALK_HEIGHT_CM.default,
                      bob: true,
                      hand: false,
                    },
              )
            }
          >
            Back to the usual
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  min,
  max,
  step,
  current,
  onValue,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  current: number;
  onValue: (v: number) => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">{value}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[current]}
        onValueChange={([v]) => v !== undefined && onValue(v)}
        aria-label={label}
      />
    </div>
  );
}

function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChecked,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChecked: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="font-normal">
        {label}
        {hint ? (
          <kbd className="ml-1.5 rounded border bg-muted px-1.5 py-0.5 font-sans text-xs">
            {hint}
          </kbd>
        ) : null}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChecked} />
    </div>
  );
}
