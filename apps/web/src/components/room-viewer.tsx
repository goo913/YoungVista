import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'react-router';
import { LuBox, LuLoaderCircle, LuMap, LuPlus, LuTriangleAlert } from 'react-icons/lu';
import {
  noticeText,
  placementProblem,
  selectedItem,
  type CatalogItem,
  type Room,
  type UnitSystem,
} from '@youngvista/core';
import { ErrorBoundary } from '@/components/error-boundary';
import { FloorPlan, type PlanEdit } from '@/components/floor-plan';
import { DesignNoticeBanner } from '@/components/furnish/design-notice';
import { FurniturePicker } from '@/components/furnish/furniture-picker';
import { ItemPanel } from '@/components/furnish/item-panel';
import { SaveIndicator } from '@/components/save-indicator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Editor3D, NavMode, Room3DHandle } from '@/components/view3d/types';
import type { CatalogIndex } from '@/lib/catalog';
import type { DesignEditor } from '@/lib/design-editor';
import { useFullscreen } from '@/lib/fullscreen';
import type { FurnitureEntry } from '@/lib/furniture';
import { cn } from '@/lib/utils';

// three.js and React Three Fiber load only when the 3D tab opens.
const Room3D = lazy(() => import('@/components/room-3d'));

/** Furnishing the room on the owner's page: the design editor and the catalog. */
export interface Furnish {
  editor: DesignEditor;
  catalog: CatalogIndex;
  /** Saves a picture of the 3D view to the room's pictures. */
  onSavePicture?: (jpeg: Blob, width: number, height: number) => Promise<void>;
  /** Sends a picture of the 3D view to AI, which saves a photo-real one to the room's pictures. */
  onAiPicture?: (jpeg: Blob, width: number, height: number) => Promise<void>;
}

interface RoomViewerProps {
  room: Room;
  furniture: readonly FurnitureEntry[];
  name: string;
  units: UnitSystem;
  /** Accessible description of the plan. */
  planTitle: string;
  /** The owner's page: add, move, turn, copy, recolour and remove furniture. */
  furnish?: Furnish | null;
}

/** Keys that turn the selected piece: ⇧R and [ counter-clockwise, R and ] clockwise. */
function turnKey(e: KeyboardEvent): number | null {
  if (e.code === 'BracketLeft') return 15;
  if (e.code === 'BracketRight') return -15;
  if (e.code === 'KeyR') return e.shiftKey ? 15 : -15;
  return null;
}

/**
 * The room's plan and 3D view as tabs (the open tab is kept in the address, `?view=3d`), and on
 * the owner's page everything to furnish it: "Add furniture", the selected piece's panel, what an
 * action did, and the save status. The full-screen button (3D) shows this whole viewer full
 * screen.
 */
export function RoomViewer({
  room,
  furniture,
  name,
  units,
  planTitle,
  furnish = null,
}: RoomViewerProps) {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === '3d' ? '3d' : 'plan';
  const root = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(root);
  const [mode, setMode] = useState<NavMode>('orbit');
  const [picking, setPicking] = useState(false);
  const [placing, setPlacing] = useState<CatalogItem | null>(null);
  const handle = useRef<Room3DHandle | null>(null);
  const editor = furnish?.editor ?? null;
  const firstPerson = view === '3d' && mode !== 'orbit';

  const productName = useCallback(
    (productId: string) => editor?.product(productId)?.name ?? 'piece',
    [editor],
  );
  const nameOf = useCallback(
    (itemId: string) => {
      const it = editor?.state.items.find((i) => i.id === itemId);
      return (it && editor?.product(it.productId)?.name) ?? 'piece';
    },
    [editor],
  );
  const invalid = useMemo(
    () =>
      new Set(
        editor ? [...editor.checks].filter(([, c]) => !c.valid).map(([id]) => id) : [],
      ) as ReadonlySet<string>,
    [editor],
  );
  const dispatch = editor?.dispatch;

  const editor3d = useMemo<Editor3D | null>(
    () =>
      editor
        ? {
            state: editor.state,
            ctx: editor.ctx,
            dispatch: editor.dispatch,
            invalid,
            placing,
            setPlacing,
            openPicker: () => setPicking(true),
            nameOf,
          }
        : null,
    [editor, invalid, placing, nameOf],
  );

  const planEdit = useMemo<PlanEdit | undefined>(
    () =>
      editor && dispatch
        ? {
            selectedId: editor.state.selectedId,
            invalid,
            onSelect: (id) => dispatch({ type: 'select', id }),
            onDragStart: (id) => dispatch({ type: 'drag-start', id }),
            onDragMove: (x, z) => dispatch({ type: 'drag-move', x, z }),
            onRotateStart: (id) => dispatch({ type: 'rotate-start', id }),
            onRotateMove: (rotationY) => dispatch({ type: 'rotate-move', rotationY }),
            onGestureEnd: () => dispatch({ type: 'gesture-end' }),
            onGestureCancel: () => dispatch({ type: 'gesture-cancel' }),
          }
        : undefined,
    [editor, dispatch, invalid],
  );

  // A product picked while walking or flying goes in hand, placed with the next click (the click
  // that picked it hands the view the mouse); otherwise in the nearest free spot to the room's
  // middle, as on the phone.
  const onPick = (item: CatalogItem) => {
    setPicking(false);
    if (!dispatch) return;
    if (firstPerson) {
      setPlacing(item);
      handle.current?.lock();
    } else {
      dispatch({ type: 'add', productId: item.id });
    }
  };
  // Keys for the selected piece (round the room and on the plan; walking and flying, the keys act
  // on what the crosshair is on): Delete removes it, R and [ ] turn it, Esc lets go of it, and
  // ⌘/Ctrl+Z brings back the piece just removed.
  const current = useRef(editor);
  useLayoutEffect(() => {
    current.current = editor;
  });
  useEffect(() => {
    if (!dispatch) return;
    const onKey = (e: KeyboardEvent) => {
      const editor = current.current;
      if (!editor) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      if (document.querySelector('[role="dialog"], [role="menu"], [role="alertdialog"]')) return;
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === 'KeyZ') {
        if (editor.state.notice?.kind === 'removed') {
          e.preventDefault();
          dispatch({ type: 'undo-remove' });
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || firstPerson) return;
      const id = editor.state.selectedId;
      if (!id || editor.state.gesture) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        dispatch({ type: 'remove', id });
        return;
      }
      if (e.key === 'Escape') {
        dispatch({ type: 'select', id: null });
        return;
      }
      const degrees = turnKey(e);
      if (degrees !== null) {
        e.preventDefault();
        dispatch({ type: 'rotate-by', id, degrees });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, firstPerson]);

  const dismissNotice = useCallback(() => dispatch?.({ type: 'dismiss-notice' }), [dispatch]);
  const onModeChange = useCallback((m: NavMode) => {
    setMode(m);
    // Back round the room, nothing stays in hand.
    if (m === 'orbit') setPlacing(null);
  }, []);

  const selected = editor ? selectedItem(editor.state) : null;
  const gesture = editor?.state.gesture ?? null;
  const live =
    gesture?.moved && !gesture.preview.valid ? placementProblem(gesture.preview, nameOf) : null;
  const misplaced =
    editor && !gesture
      ? [...editor.checks.values()].filter(
          (c) => !c.valid && !c.reasons.includes('unknown-product'),
        ).length
      : 0;
  const selectedCheck = selected ? editor?.checks.get(selected.id) : undefined;
  const selectedProblem =
    selectedCheck && !selectedCheck.valid ? placementProblem(selectedCheck, nameOf) : null;

  return (
    <div
      ref={root}
      data-fullscreen={fullscreen.active ? '' : undefined}
      className={cn(
        'grid gap-4',
        fullscreen.active && 'flex flex-col gap-3 overflow-y-auto bg-background p-3 sm:p-4',
        fullscreen.filling && 'fixed inset-0 z-50',
      )}
    >
      <Tabs
        value={view}
        onValueChange={(next) =>
          setParams(
            (p) => {
              if (next === '3d') p.set('view', '3d');
              else p.delete('view');
              return p;
            },
            { replace: true },
          )
        }
        className={cn('gap-4', fullscreen.active && 'min-h-0 flex-1')}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="plan">
              <LuMap aria-hidden />
              Plan
            </TabsTrigger>
            <TabsTrigger value="3d">
              <LuBox aria-hidden />
              3D
            </TabsTrigger>
          </TabsList>
          {editor ? (
            <div className="flex items-center gap-3">
              <SaveIndicator status={editor.status} />
              <Button size="sm" onClick={() => setPicking(true)}>
                <LuPlus aria-hidden />
                Add furniture
              </Button>
            </div>
          ) : null}
        </div>
        <TabsContent value="plan" className="flex justify-center">
          <FloorPlan
            room={room}
            units={units}
            furniture={furniture}
            title={planTitle}
            className={fullscreen.active ? 'max-h-[calc(100svh-14rem)]' : 'max-h-[70vh]'}
            edit={planEdit}
          />
        </TabsContent>
        <TabsContent value="3d" className={cn(fullscreen.active && 'flex min-h-0 flex-col')}>
          <ErrorBoundary fallback={() => <ViewerFailed />}>
            <Suspense fallback={<ViewerLoading />}>
              <Room3D
                room={room}
                furniture={furniture}
                name={name}
                editor={editor3d}
                fullscreen={fullscreen}
                handle={handle}
                onModeChange={onModeChange}
                onSavePicture={furnish?.onSavePicture}
                onAiPicture={furnish?.onAiPicture}
              />
            </Suspense>
          </ErrorBoundary>
        </TabsContent>
      </Tabs>

      {editor && dispatch ? (
        <div className="grid gap-2" aria-live="polite">
          {editor.state.notice ? (
            <DesignNoticeBanner
              notice={editor.state.notice}
              text={noticeText(editor.state.notice, nameOf, productName)}
              onUndo={() => dispatch({ type: 'undo-remove' })}
              onDismiss={dismissNotice}
            />
          ) : null}
          {live ? (
            <p role="alert" className="text-sm text-destructive">
              {live}
            </p>
          ) : null}
          {!live && misplaced > 0 ? (
            <Alert variant="destructive">
              <LuTriangleAlert aria-hidden />
              <AlertDescription>
                {misplaced === 1 ? 'A piece is' : `${misplaced} pieces are`} outside the room or on
                top of another. Drag {misplaced === 1 ? 'it' : 'them'} somewhere free.
              </AlertDescription>
            </Alert>
          ) : null}
          {selected ? (
            <ItemPanel
              item={selected}
              product={editor.product(selected.productId)}
              units={units}
              problem={selectedProblem}
              onRotate={(degrees) => dispatch({ type: 'rotate-by', id: selected.id, degrees })}
              onDuplicate={() => dispatch({ type: 'duplicate', id: selected.id })}
              onRemove={() => dispatch({ type: 'remove', id: selected.id })}
              onVariant={(variant) => dispatch({ type: 'set-variant', id: selected.id, variant })}
              onClose={() => dispatch({ type: 'select', id: null })}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {editor.state.items.length === 0
                ? 'Add a piece, then drag it where you want it. It snaps to walls.'
                : `${editor.state.items.length} ${editor.state.items.length === 1 ? 'piece' : 'pieces'}. Click one to move, turn, copy or remove it.`}
            </p>
          )}
          <FurniturePicker
            open={picking}
            onOpenChange={setPicking}
            catalog={furnish!.catalog}
            units={units}
            onPick={onPick}
            hint={
              firstPerson
                ? 'Pick one, then click where it should go.'
                : 'It goes in a free spot; drag it where you want it.'
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function ViewerLoading() {
  return (
    <div
      role="status"
      className="flex aspect-square max-h-[75vh] w-full items-center justify-center gap-2 rounded-lg border bg-muted/40 text-sm text-muted-foreground sm:aspect-[16/10]"
    >
      <LuLoaderCircle className="size-5 animate-spin" aria-hidden />
      Loading the 3D view
    </div>
  );
}

function ViewerFailed() {
  return (
    <div className="flex aspect-square max-h-[75vh] w-full flex-col items-center justify-center gap-3 rounded-lg border bg-muted/40 p-6 text-center text-sm sm:aspect-[16/10]">
      <LuTriangleAlert className="size-6 text-destructive" aria-hidden />
      <p className="max-w-sm text-muted-foreground">
        The 3D view could not load. Check your connection, then reload the page.
      </p>
      <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </div>
  );
}
