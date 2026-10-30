import { NextResponse } from 'next/server';
import { generateContentClusters } from '@/lib/ai/clustering-agent';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const clusters = await generateContentClusters();
    return NextResponse.json({ success: true, count: clusters.length, clusters });
  } catch (err: any) {
    console.error('[API Insights Generate Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
