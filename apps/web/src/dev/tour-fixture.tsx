/** Dev tool entry: the test tour maker (fixture-page.tsx), served at /dev/tour-fixture.html. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { FixturePage } from './fixture-page';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FixturePage />
  </StrictMode>,
);
