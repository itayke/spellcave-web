// App shell: boots the engine through the store on mount, then renders the Phase 4 cave view
// (CSS-masked sprites + real chrome in src/view/). Loading/error states are simple centered text.
import { useEffect, useRef } from 'react';
import { useGameStore } from './store/gameStore.js';
import CaveView from './view/CaveView.jsx';

export default function App() {
  const status = useGameStore((s) => s.status);
  const error = useGameStore((s) => s.error);
  const init = useGameStore((s) => s.init);
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return; // belt-and-suspenders vs StrictMode double-mount (store also guards)
    didInit.current = true;
    init({ viewportWidth: window.innerWidth, viewportHeight: window.innerHeight });
  }, [init]);

  if (status === 'error') return <Centered>Failed to load: {error}</Centered>;
  if (status !== 'ready') return <Centered>Loading cave…</Centered>;
  return <CaveView />;
}

function Centered({ children }) {
  return (
    <div style={{
      color: '#d7d6d3', fontFamily: 'var(--font-ui), sans-serif', display: 'flex',
      height: '100%', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      {children}
    </div>
  );
}
