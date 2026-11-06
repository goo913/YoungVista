import { useState } from 'react';
import { CameraScreen } from '@/components/camera-hud';
import { TurnScan } from '@/components/turn-scan/turn-scan';

/**
 * Scanning a room by turning around, no corners to mark (components/turn-scan/turn-scan.tsx).
 * A camera screen: landscape, full screen (app/(app)/_layout.tsx), with its own safe area.
 */
export default function ScanTurnScreen() {
  // "Scan again" starts over with a new session and a new scan id.
  const [attempt, setAttempt] = useState(0);
  return (
    <CameraScreen>
      <TurnScan key={attempt} onRestart={() => setAttempt((n) => n + 1)} />
    </CameraScreen>
  );
}
