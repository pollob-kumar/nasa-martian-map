'use client';

import dynamic from 'next/dynamic';

// The HUD uses WebAudio and three.js/WebGL (browser only), so it loads client-side (ssr: false).
const MarsHudApp = dynamic(() => import('./MarsHudApp'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-black text-slate-300 font-mono text-sm tracking-widest">
      INITIALIZING HELMET SYSTEMS…
    </div>
  ),
});

export default function MarsHudLoader({ regionId }: { regionId: string }) {
  return <MarsHudApp regionId={regionId} />;
}
