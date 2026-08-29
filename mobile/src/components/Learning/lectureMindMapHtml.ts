import {
  CANVAS_SIZE, CX, CY, BRANCH_RADIUS, LEAF_RADIUS_INNER, LEAF_RADIUS_OUTER,
  BRANCH_COLORS_DARK,
} from './lectureMindMapStyles';

export interface MindMapBranch {
  label: string;
  children: string[];
}

export interface MindMapData {
  centralTopic: string;
  branches: MindMapBranch[];
}

export function polarXY(r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

export function generateMindMapHtml(mapData: MindMapData, lectureTitle: string): string {
  const branches = mapData.branches.slice(0, 6);
  const bCount = branches.length;

  const escapeXml = (unsafe: string) => (unsafe || '').replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });

  const layoutData = branches.map((branch, bi) => {
    const bAngle = (360 / bCount) * bi;
    const bPos = polarXY(BRANCH_RADIUS, bAngle);
    const color = BRANCH_COLORS_DARK[bi % BRANCH_COLORS_DARK.length];
    const leafCount = Math.min(branch.children.length, 4);
    const angleSpread = leafCount <= 2 ? 30 : leafCount === 3 ? 42 : 50;
    const leaves = branch.children.slice(0, 4).map((child, ci) => {
      const offset = leafCount > 1 ? (ci - (leafCount - 1) / 2) * (angleSpread / (leafCount - 1)) : 0;
      const lAngle = bAngle + offset;
      const leafRadius = leafCount > 2 ? (ci % 2 === 0 ? LEAF_RADIUS_OUTER : LEAF_RADIUS_INNER) : 530;
      return { label: child, pos: polarXY(leafRadius, lAngle) };
    });
    return { branch, bPos, color, leaves, bAngle, bi };
  });

  let connectorsSvg = '';
  layoutData.forEach((b) => {
    connectorsSvg += `<line x1="${CX}" y1="${CY}" x2="${b.bPos.x}" y2="${b.bPos.y}" stroke="${b.color}" stroke-width="2.5" stroke-opacity="0.6" stroke-linecap="round" />\n`;
    b.leaves.forEach((leaf) => {
      connectorsSvg += `<line x1="${b.bPos.x}" y1="${b.bPos.y}" x2="${leaf.pos.x}" y2="${leaf.pos.y}" stroke="${b.color}" stroke-width="1.8" stroke-dasharray="5,5" stroke-opacity="0.4" stroke-linecap="round" />\n`;
    });
  });

  // SVG Leaves (Full text with zero truncation)
  let leavesSvg = '';
  layoutData.forEach((b) => {
    b.leaves.forEach((leaf) => {
      leavesSvg += `
        <foreignObject x="${leaf.pos.x - 95}" y="${leaf.pos.y - 26}" width="190" height="52">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; display:flex; align-items:center; gap:8px; padding:6px 12px; background:#14141e; border:1.5px solid ${b.color}; border-radius:14px; box-sizing:border-box; color:#f1f5f9; font-family:'Inter',-apple-system,sans-serif; font-size:11px; font-weight:600; line-height:1.25; text-align:left; overflow:hidden;">
            <div style="width:6px; height:6px; border-radius:50%; background:${b.color}; flex-shrink:0;"></div>
            <div style="flex:1; word-wrap:break-word; overflow:hidden;">${escapeXml(leaf.label)}</div>
          </div>
        </foreignObject>
      `;
    });
  });

  // SVG Branches (Pillars) (Full text with zero truncation)
  let branchesSvg = '';
  layoutData.forEach((b) => {
    branchesSvg += `
      <foreignObject x="${b.bPos.x - 100}" y="${b.bPos.y - 42}" width="200" height="84">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:8px 12px; background:#101018; border:2.5px solid ${b.color}; border-radius:18px; box-sizing:border-box; text-align:center; overflow:hidden;">
          <div style="background:${b.color}25; color:${b.color}; font-size:9px; font-weight:800; padding:2px 8px; border-radius:6px; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px;">PILLAR ${b.bi + 1}</div>
          <div style="color:#ffffff; font-family:'Inter',-apple-system,sans-serif; font-size:12.5px; font-weight:700; line-height:1.25; word-wrap:break-word;">${escapeXml(b.branch.label)}</div>
        </div>
      </foreignObject>
    `;
  });

  // SVG Center Hub (Full text with zero truncation)
  const centerHubSvg = `
    <foreignObject x="${CX - 130}" y="${CY - 54}" width="260" height="108">
      <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:10px 16px; background:#1a1130; border:3px solid #a599ff; border-radius:22px; box-sizing:border-box; text-align:center; box-shadow:0 0 30px rgba(165,153,255,0.3); overflow:hidden;">
        <div style="background:#a599ff30; color:#a599ff; font-size:10px; font-weight:800; padding:2px 10px; border-radius:8px; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.8px;">✨ CENTRAL THEME</div>
        <div style="color:#ffffff; font-family:'Inter',-apple-system,sans-serif; font-size:15px; font-weight:800; line-height:1.25; word-wrap:break-word;">${escapeXml(mapData.centralTopic)}</div>
      </div>
    </foreignObject>
  `;

  let breakdownHtml = '';
  layoutData.forEach((b) => {
    breakdownHtml += `
      <div class="pillar-card" style="border-color: ${b.color}40; background: linear-gradient(135deg, #13131c 0%, #0d0d14 100%);">
        <div class="pillar-header" style="color: ${b.color};">
          <span class="pillar-tag" style="background: ${b.color}25; color: ${b.color};">Pillar ${b.bi + 1}</span>
          <strong>${escapeXml(b.branch.label)}</strong>
        </div>
        <ul class="leaf-list">
          ${b.branch.children.map(c => `<li><span class="bullet" style="background: ${b.color};"></span>${escapeXml(c)}</li>`).join('')}
        </ul>
      </div>
    `;
  });

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #080512;
            color: #f1f5f9;
            padding: 32px;
            min-height: 100vh;
          }
          .doc-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid rgba(255,255,255,0.08);
            padding-bottom: 16px;
            margin-bottom: 24px;
          }
          .title-area h1 {
            font-size: 24px;
            font-weight: 800;
            color: #ffffff;
            letter-spacing: -0.5px;
          }
          .title-area p {
            font-size: 13px;
            color: #94a3b8;
            margin-top: 4px;
          }
          .badge {
            background: rgba(165,153,255,0.15);
            border: 1px solid rgba(165,153,255,0.3);
            color: #a599ff;
            font-size: 11px;
            font-weight: 700;
            padding: 4px 10px;
            border-radius: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .svg-canvas-container {
            width: 100%;
            max-width: 1200px;
            margin: 0 auto;
            border-radius: 24px;
            background: radial-gradient(circle at 50% 50%, #16102c 0%, #080512 85%);
            border: 1px solid rgba(255,255,255,0.08);
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0,0,0,0.6);
            margin-bottom: 36px;
          }
          svg {
            display: block;
            width: 100%;
            height: auto;
          }
          .breakdown-section {
            max-width: 1200px;
            margin: 0 auto;
          }
          .section-title {
            font-size: 17px;
            font-weight: 700;
            color: #e2e8f0;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .pillar-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
          }
          .pillar-card {
            border: 1px solid;
            border-radius: 14px;
            padding: 16px;
          }
          .pillar-header {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            margin-bottom: 12px;
          }
          .pillar-tag {
            font-size: 9px;
            font-weight: 800;
            padding: 2px 6px;
            border-radius: 6px;
            text-transform: uppercase;
          }
          .leaf-list {
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .leaf-list li {
            font-size: 12px;
            color: #cbd5e1;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .bullet {
            width: 6px;
            height: 6px;
            border-radius: 3px;
            display: inline-block;
            flex-shrink: 0;
          }
          .doc-footer {
            margin-top: 40px;
            padding-top: 16px;
            border-top: 1px solid rgba(255,255,255,0.06);
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #64748b;
          }
        </style>
      </head>
      <body>
        <div class="doc-header">
          <div class="title-area">
            <h1>🗺️ Concept Mind Map: ${escapeXml(mapData.centralTopic)}</h1>
            <p>Lecture: <strong>${escapeXml(lectureTitle)}</strong></p>
          </div>
          <div class="badge">ZenTrack Study Engine</div>
        </div>

        <div class="svg-canvas-container">
          <svg viewBox="0 0 1600 1600" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#a599ff" stop-opacity="0.18" />
                <stop offset="100%" stop-color="#080512" stop-opacity="0" />
              </radialGradient>
            </defs>
            <circle cx="${CX}" cy="${CY}" r="650" fill="url(#centerGlow)" />
            ${connectorsSvg}
            ${leavesSvg}
            ${branchesSvg}
            ${centerHubSvg}
          </svg>
        </div>

        <div class="breakdown-section">
          <div class="section-title">
            <span>📚 Key Conceptual Pillars & Breakdown</span>
          </div>
          <div class="pillar-grid">
            ${breakdownHtml}
          </div>
        </div>

        <div class="doc-footer">
          <span>Exported from ZenTrack Mobile &bull; Concept Mind Map</span>
          <span>Date: ${new Date().toLocaleDateString()}</span>
        </div>
      </body>
    </html>
  `;
}

// ── Gemini Prompt Builder ─────────────────────────────────────────────────────
