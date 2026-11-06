import { useState, type FormEvent } from 'react';
import { LuEllipsis, LuLoaderCircle, LuPencil, LuTrash2, LuTriangleAlert } from 'react-icons/lu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ROOM_NAME_MAX,
  cleanRoomName,
  deleteRoom,
  renameRoom,
  roomChangeErrorMessage,
  type RoomSummary,
} from '@/lib/rooms';
import { cn } from '@/lib/utils';

type Room = Pick<RoomSummary, 'id' | 'ownerId' | 'name' | 'shareId' | 'tour'>;

/**
 * A room's "…" menu: rename it, or delete it (after asking) with its pictures and its private
 * link. `onDeleted` runs once it is gone.
 */
export function RoomActions({
  room,
  onDeleted,
  className,
  size = 'icon-sm',
}: {
  room: Room;
  onDeleted?: () => void;
  className?: string;
  size?: 'icon-sm' | 'icon';
}) {
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size={size}
            className={cn('bg-background', className)}
            aria-label={`Options for ${room.name}`}
          >
            <LuEllipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setDialog('rename')}>
            <LuPencil aria-hidden />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
            <LuTrash2 aria-hidden />
            Delete room
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameRoomDialog
        room={room}
        open={dialog === 'rename'}
        onOpenChange={(o) => setDialog(o ? 'rename' : null)}
      />
      <DeleteRoomDialog
        room={room}
        open={dialog === 'delete'}
        onOpenChange={(o) => setDialog(o ? 'delete' : null)}
        onDeleted={onDeleted}
      />
    </>
  );
}

function RenameRoomDialog({
  room,
  open,
  onOpenChange,
}: {
  room: Room;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* A fresh form each time it opens, starting from the current name. */}
        {open ? <RenameForm room={room} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({ room, onDone }: { room: Room; onDone: () => void }) {
  const [name, setName] = useState(room.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = cleanRoomName(name);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!clean) return;
    if (clean === room.name) {
      onDone();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await renameRoom(room.id, clean);
      onDone();
    } catch (err) {
      setError(roomChangeErrorMessage(err));
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Rename room</DialogTitle>
        <DialogDescription>The new name shows on the phone and the website.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="room-name">Name</Label>
        <Input
          id="room-name"
          value={name}
          maxLength={ROOM_NAME_MAX}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!clean}
        />
        {!clean ? <p className="text-sm text-destructive">A room needs a name.</p> : null}
      </div>
      {error ? (
        <Alert variant="destructive">
          <LuTriangleAlert aria-hidden />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !clean}>
          {busy ? <LuLoaderCircle className="animate-spin" aria-hidden /> : null}
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

function DeleteRoomDialog({
  room,
  open,
  onOpenChange,
  onDeleted,
}: {
  room: Room;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await deleteRoom(room);
      onOpenChange(false);
      onDeleted?.();
    } catch (err) {
      setError(roomChangeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        setError(null);
        onOpenChange(o);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{room.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The room, its furniture and its pictures
            {room.tour ? ' (the 360° pictures and the scan too)' : ''} are deleted for good, on the
            phone and the website{room.shareId ? ', and its private link stops working' : ''}. This
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <Alert variant="destructive">
            <LuTriangleAlert aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep the room</AlertDialogCancel>
          {/* Not an AlertDialogAction: the dialog stays open until the room is gone. */}
          <Button variant="destructive" disabled={busy} onClick={() => void confirm()}>
            {busy ? (
              <LuLoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <LuTrash2 aria-hidden />
            )}
            {busy ? 'Deleting…' : 'Delete room'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
