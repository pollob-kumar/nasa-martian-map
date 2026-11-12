import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

/** Lists the audio files you dropped into public/sounds/ (wind, footstep, click, lock, alert, suit). */
export async function GET() {
  const out: Record<string, string> = {};
  try {
    for (const f of await fs.readdir(path.join(process.cwd(), 'public', 'sounds'))) {
      const m = /^(wind|footstep|click|lock|alert|suit)\.(mp3|wav|ogg|m4a)$/i.exec(f);
      if (m) out[m[1].toLowerCase()] = `/sounds/${f}`;
    }
  } catch { /* folder missing: no custom sounds */ }
  return Response.json(out);
}
