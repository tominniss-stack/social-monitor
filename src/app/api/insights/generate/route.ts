import { NextResponse } from 'next/server';
import { generateContentClusters } from '@/lib/ai/clustering-agent';
import { internalError } from '@/lib/validation';
import { requireMembership, authErrorResponse } from '@/lib/auth/workspace';
import { writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const { user, workspace } = await requireMembership('MANAGER');
    const clusters = await generateContentClusters();

    await writeAudit({
      workspaceId: workspace.id,
      actorEmail: user.email,
      action: 'insights.generate',
      targetType: 'contentCluster',
      targetId: workspace.id,
      metadata: { clusterCount: clusters.length },
    });

    return NextResponse.json({ success: true, count: clusters.length, clusters });
  } catch (err) {
    return authErrorResponse(err) ?? internalError('API Insights Generate Error', err);
  }
}
