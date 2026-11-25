// Farm-theme board art (fences, dragon, explorer, nest). Stateless draw calls into a 2D context.
window.DSArt = (function () {
  const INK = '#1e1b18';
  const INK_SOFT = '#332b23';

  function rr(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function groundShadow(ctx, cx, cy, rx, ry, alpha) {
    ctx.save();
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(2, rx));
    g.addColorStop(0, `rgba(9, 12, 10, ${alpha})`);
    g.addColorStop(1, 'rgba(9, 12, 10, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(2, rx), Math.max(1.5, ry), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function eye(ctx, cx, cy, r) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.1, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.34, cy - r * 0.36, r * 0.42, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.arc(cx + r * 0.36, cy + r * 0.28, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }

  function cheeks(ctx, cx, cy, dx, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + dir * dx, cy, r * 1.35, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function rimLight(ctx, cx, cy, r, from, to, width) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.92, from, to);
    ctx.stroke();
    ctx.restore();
  }

  function floor(ctx, x, y, s, r, c) {
    const alt = (r + c) % 2 === 0;
    const g = ctx.createLinearGradient(x, y, x, y + s);
    g.addColorStop(0, alt ? 'rgba(182, 208, 160, 0.10)' : 'rgba(182, 208, 160, 0.065)');
    g.addColorStop(1, alt ? 'rgba(120, 152, 104, 0.075)' : 'rgba(120, 152, 104, 0.045)');
    ctx.fillStyle = g;
    rr(ctx, x + 1, y + 1, s - 2, s - 2, s * 0.16);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    rr(ctx, x + 1.5, y + 1.5, s - 3, s - 3, s * 0.16);
    ctx.stroke();
  }

  function fence(ctx, x, y, s, n) {
    const pad = Math.max(1.5, s * 0.035);
    const box = { x: x + pad, y: y + pad, w: s - pad * 2, h: s - pad * 2 };
    const lw = Math.max(1.4, s * 0.035);

    ctx.save();
    ctx.fillStyle = '#2a1f18';
    rr(ctx, box.x, box.y, box.w, box.h, s * 0.16);
    ctx.fill();

    const wood = ctx.createLinearGradient(x, y, x, y + s);
    wood.addColorStop(0, '#e0a866');
    wood.addColorStop(0.42, '#c07f3f');
    wood.addColorStop(1, '#8a4f1d');

    const railH = Math.max(4, s * 0.15);
    const railYs = [y + s * 0.3, y + s * 0.6];
    const railLeft = n && n.left ? x - 1 : x + s * 0.075;
    const railRight = n && n.right ? x + s + 1 : x + s * 0.925;
    const railW = railRight - railLeft;

    for (const ry of railYs) {
      groundShadow(ctx, railLeft + railW / 2, ry + railH + s * 0.03, railW * 0.5, s * 0.045, 0.32);
      ctx.fillStyle = wood;
      ctx.strokeStyle = INK;
      ctx.lineWidth = lw;
      ctx.lineJoin = 'round';
      rr(ctx, railLeft, ry, railW, railH, railH * 0.36);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 240, 205, 0.38)';
      ctx.fillRect(railLeft + railW * 0.12, ry + railH * 0.16, railW * 0.68, Math.max(1, railH * 0.2));
      ctx.strokeStyle = 'rgba(94, 51, 16, 0.5)';
      ctx.lineWidth = Math.max(0.7, s * 0.012);
      ctx.beginPath();
      ctx.moveTo(railLeft + railW * 0.1, ry + railH * 0.68);
      ctx.lineTo(railLeft + railW * 0.72, ry + railH * 0.66);
      ctx.stroke();
    }

    const postW = Math.max(8, s * 0.26);
    const postX = x + (s - postW) / 2;
    const postTop = y + (n && n.up ? -s * 0.12 : s * 0.14);
    const postBottom = y + (n && n.down ? s * 1.12 : s * 0.86);
    const postH = postBottom - postTop;

    groundShadow(ctx, x + s / 2, postBottom - s * 0.02, postW * 0.72, s * 0.055, 0.42);

    ctx.fillStyle = wood;
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.6, s * 0.04);
    rr(ctx, postX, postTop, postW, postH, postW * 0.34);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 240, 205, 0.45)';
    ctx.lineWidth = Math.max(0.8, s * 0.016);
    rr(ctx, postX + postW * 0.18, postTop + postH * 0.06, postW * 0.16, postH * 0.62, postW * 0.1);
    ctx.stroke();

    if (!(n && n.up)) {
      const capG = ctx.createLinearGradient(postX, postTop, postX + postW, postTop + postW * 0.6);
      capG.addColorStop(0, '#f3c88a');
      capG.addColorStop(1, '#b9762f');
      ctx.fillStyle = capG;
      ctx.beginPath();
      ctx.ellipse(x + s / 2, postTop + postW * 0.34, postW * 0.52, postW * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = INK_SOFT;
    for (const ry of railYs) {
      const ny = ry + railH * 0.5;
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(x + s / 2 + dir * postW * 0.3, ny, Math.max(0.9, s * 0.021), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function nest(ctx, x, y, s, t) {
    const cx = x + s / 2;
    const cy = y + s / 2;
    const pulse = 0.5 + 0.5 * Math.sin(t / 520);

    ctx.save();
    const glow = ctx.createRadialGradient(cx, cy, s * 0.02, cx, cy, s * 0.44);
    glow.addColorStop(0, `rgba(253, 224, 71, ${0.22 + 0.14 * pulse})`);
    glow.addColorStop(0.6, 'rgba(251, 191, 36, 0.10)');
    glow.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.44, 0, Math.PI * 2);
    ctx.fill();

    groundShadow(ctx, cx, cy + s * 0.27, s * 0.3, s * 0.09, 0.3);

    ctx.strokeStyle = '#9a6427';
    ctx.lineWidth = Math.max(1.2, s * 0.055);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.17, s * 0.29, s * 0.145, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 214, 153, 0.55)';
    ctx.lineWidth = Math.max(0.9, s * 0.026);
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.16, s * 0.29, s * 0.145, 0, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();

    for (let i = 0; i < 12; i += 1) {
      const a = -1.9 + i * 0.34;
      const inner = 0.16 + (i % 3) * 0.02;
      const outer = 0.34 + (i % 4) * 0.015;
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(214, 154, 78, 0.85)' : 'rgba(160, 104, 42, 0.8)';
      ctx.lineWidth = Math.max(0.8, s * 0.024);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * s * inner, cy + s * 0.15 + Math.sin(a) * s * inner * 0.55);
      ctx.quadraticCurveTo(
        cx + Math.cos(a + 0.16) * s * (outer - 0.05), cy + s * 0.15 + Math.sin(a + 0.16) * s * (outer - 0.05) * 0.6,
        cx + Math.cos(a + 0.1) * s * outer, cy + s * 0.15 + Math.sin(a + 0.1) * s * outer * 0.68
      );
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255, 236, 179, 0.6)';
    ctx.lineWidth = Math.max(0.9, s * 0.028);
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.16, s * 0.18, s * 0.075, 0, 0, Math.PI * 2);
    ctx.stroke();

    const outer = s * 0.155 * (1 + 0.06 * pulse);
    const inner = s * 0.068 * (1 + 0.06 * pulse);
    const sx = cx;
    const sy = cy - s * 0.01;
    const starG = ctx.createLinearGradient(sx, sy - outer, sx, sy + outer);
    starG.addColorStop(0, '#fef9c3');
    starG.addColorStop(0.55, '#fde047');
    starG.addColorStop(1, '#f59e0b');
    ctx.fillStyle = starG;
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = Math.max(1.1, s * 0.026);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const rad = i % 2 === 0 ? outer : inner;
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = sx + Math.cos(ang) * rad;
      const py = sy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.ellipse(sx - outer * 0.28, sy - outer * 0.34, outer * 0.2, outer * 0.11, -0.6, 0, Math.PI * 2);
    ctx.fill();

    const twinkle = 0.35 + 0.65 * pulse;
    ctx.fillStyle = `rgba(255, 251, 214, ${twinkle})`;
    for (const spot of [[-0.34, -0.3], [0.36, -0.14], [0.16, 0.34]]) {
      ctx.beginPath();
      ctx.arc(cx + spot[0] * s * 0.5, cy + spot[1] * s * 0.5, Math.max(0.8, s * 0.018), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function dragon(ctx, x, y, s, golden, t) {
    const body = s * 0.335;
    const cx = x + s / 2;
    const cy = y + s * 0.52 + Math.sin(t / 430 + x * 0.05) * s * 0.016;
    const lw = Math.max(1.6, s * 0.04);

    ctx.save();
    groundShadow(ctx, cx, y + s * 0.85, body * 1.02, s * 0.075, golden ? 0.42 : 0.34);

    if (golden) {
      const aura = ctx.createRadialGradient(cx, cy, body * 0.2, cx, cy, body * 1.75);
      aura.addColorStop(0, 'rgba(253, 224, 71, 0.55)');
      aura.addColorStop(0.6, 'rgba(251, 191, 36, 0.2)');
      aura.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(cx, cy, body * 1.75, 0, Math.PI * 2);
      ctx.fill();
    }

    // wings behind the body (scalloped membrane + bone strokes)
    const flap = Math.sin(t / 620) * 0.1;
    for (const dir of [-1, 1]) {
      const tipX = cx + dir * body * (1.62 + flap);
      const tipY = cy - body * (0.55 + flap * 0.5);
      const wg = ctx.createLinearGradient(cx, cy - body * 0.9, tipX, cy + body * 0.3);
      wg.addColorStop(0, golden ? 'rgba(255, 251, 224, 0.98)' : 'rgba(209, 250, 229, 0.98)');
      wg.addColorStop(1, golden ? 'rgba(234, 179, 8, 0.82)' : 'rgba(34, 197, 94, 0.82)');
      ctx.fillStyle = wg;
      ctx.strokeStyle = INK;
      ctx.lineWidth = lw * 0.8;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + dir * body * 0.42, cy - body * 0.42);
      ctx.quadraticCurveTo(tipX, tipY - body * 0.42, tipX, tipY);
      ctx.quadraticCurveTo(cx + dir * body * 1.16, cy - body * 0.1, cx + dir * body * 1.02, cy + body * 0.16);
      ctx.quadraticCurveTo(cx + dir * body * 0.86, cy + body * 0.04, cx + dir * body * 0.72, cy + body * 0.24);
      ctx.quadraticCurveTo(cx + dir * body * 0.5, cy + body * 0.12, cx + dir * body * 0.38, cy + body * 0.26);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(30, 27, 24, 0.32)';
      ctx.lineWidth = Math.max(0.8, body * 0.05);
      ctx.beginPath();
      ctx.moveTo(cx + dir * body * 0.44, cy - body * 0.4);
      ctx.quadraticCurveTo(cx + dir * body * 0.95, cy - body * 0.32, tipX - dir * body * 0.08, tipY + body * 0.06);
      ctx.stroke();
    }

    // tail curl
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, body * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + body * 0.25, cy + body * 0.72);
    ctx.quadraticCurveTo(cx + body * 1.05, cy + body * 0.98, cx + body * 0.78, cy + body * 0.42);
    ctx.stroke();
    ctx.strokeStyle = golden ? '#eab308' : '#22c55e';
    ctx.lineWidth = Math.max(1.2, body * 0.1);
    ctx.stroke();

    // little feet with claws
    for (const dir of [-1, 1]) {
      ctx.fillStyle = golden ? '#fbbf24' : '#34d399';
      ctx.strokeStyle = INK;
      ctx.lineWidth = lw * 0.7;
      ctx.beginPath();
      ctx.ellipse(cx + dir * body * 0.42, cy + body * 0.78, body * 0.22, body * 0.13, dir * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(30, 27, 24, 0.6)';
      ctx.lineWidth = Math.max(0.7, body * 0.035);
      for (let k = -1; k <= 1; k += 1) {
        ctx.beginPath();
        ctx.moveTo(cx + dir * body * 0.42 + k * body * 0.09, cy + body * 0.86);
        ctx.lineTo(cx + dir * body * 0.42 + k * body * 0.1, cy + body * 0.9);
        ctx.stroke();
      }
    }

    // soft body
    const g = ctx.createRadialGradient(cx - body * 0.34, cy - body * 0.42, body * 0.15, cx, cy, body * 1.25);
    if (golden) {
      g.addColorStop(0, '#fffbe0');
      g.addColorStop(0.5, '#fcd34d');
      g.addColorStop(1, '#d97706');
    } else {
      g.addColorStop(0, '#bbf7d0');
      g.addColorStop(0.5, '#4ade80');
      g.addColorStop(1, '#15803d');
    }
    ctx.fillStyle = g;
    ctx.strokeStyle = INK;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.ellipse(cx, cy, body, body * 0.94, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // belly
    ctx.fillStyle = golden ? 'rgba(255, 250, 224, 0.92)' : 'rgba(236, 253, 245, 0.9)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + body * 0.34, body * 0.52, body * 0.44, 0, 0, Math.PI * 2);
    ctx.fill();

    // horns
    for (const dir of [-1, 1]) {
      ctx.fillStyle = golden ? '#fde68a' : '#a7f3d0';
      ctx.strokeStyle = INK;
      ctx.lineWidth = lw * 0.65;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + dir * body * 0.3, cy - body * 0.72);
      ctx.quadraticCurveTo(cx + dir * body * 0.44, cy - body * 1.14, cx + dir * body * 0.66, cy - body * 1.1);
      ctx.quadraticCurveTo(cx + dir * body * 0.54, cy - body * 0.86, cx + dir * body * 0.5, cy - body * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // brow scales
    ctx.fillStyle = golden ? 'rgba(253, 230, 138, 0.9)' : 'rgba(134, 239, 172, 0.9)';
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + dir * body * 0.34, cy - body * 0.4, body * 0.13, body * 0.085, dir * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // dorsal spikes
    ctx.fillStyle = golden ? '#f59e0b' : '#15803d';
    for (const [dx, size] of [[0, 0.16], [-0.3, 0.12], [0.3, 0.12]]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * body, cy - body * 0.86);
      ctx.lineTo(cx + (dx - size * 0.5) * body, cy - body * 0.96);
      ctx.lineTo(cx + (dx + size * 0.5) * body, cy - body * 0.96);
      ctx.closePath();
      ctx.fill();
    }

    // snout + nostrils + smile
    ctx.fillStyle = golden ? 'rgba(255, 255, 240, 0.95)' : 'rgba(240, 253, 244, 0.95)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + body * 0.3, body * 0.42, body * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(30, 27, 24, 0.45)';
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + dir * body * 0.13, cy + body * 0.24, body * 0.045, body * 0.032, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(30, 27, 24, 0.55)';
    ctx.lineWidth = Math.max(0.9, s * 0.017);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy + body * 0.3, body * 0.14, 0.35, Math.PI - 0.35);
    ctx.stroke();

    // eyes
    const eyeR = Math.max(1.4, body * 0.19);
    eye(ctx, cx - body * 0.34, cy - body * 0.08, eyeR);
    eye(ctx, cx + body * 0.34, cy - body * 0.08, eyeR);
    cheeks(ctx, cx, cy + body * 0.16, body * 0.6, body * 0.11, golden ? 'rgba(251, 146, 60, 0.4)' : 'rgba(248, 113, 133, 0.42)');

    rimLight(ctx, cx, cy, body * 1.0, Math.PI * 1.06, Math.PI * 1.55, Math.max(1, s * 0.022));

    if (golden) {
      ctx.fillStyle = 'rgba(255, 251, 214, 0.95)';
      for (const spot of [[-0.72, -0.5], [0.75, -0.34], [0.5, 0.62]]) {
        const tw = 0.5 + 0.5 * Math.sin(t / 300 + spot[0] * 5);
        ctx.globalAlpha = 0.35 + 0.5 * tw;
        ctx.beginPath();
        ctx.arc(cx + spot[0] * body, cy + spot[1] * body, Math.max(0.9, s * 0.02), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function explorer(ctx, x, y, s, t) {
    const cx = x + s / 2;
    const cy = y + s * 0.54 + Math.sin(t / 400) * s * 0.012;
    const lw = Math.max(1.4, s * 0.034);

    ctx.save();
    groundShadow(ctx, cx, y + s * 0.9, s * 0.24, s * 0.065, 0.4);

    // backpack behind torso
    const packG = ctx.createLinearGradient(cx - s * 0.3, cy, cx + s * 0.3, cy + s * 0.3);
    packG.addColorStop(0, '#c2762c');
    packG.addColorStop(1, '#8a4a12');
    ctx.fillStyle = packG;
    ctx.strokeStyle = INK;
    ctx.lineWidth = lw;
    rr(ctx, cx - s * 0.3, cy - s * 0.02, s * 0.17, s * 0.3, s * 0.075);
    ctx.fill();
    ctx.stroke();

    // chubby torso
    const bodyG = ctx.createLinearGradient(cx, cy, cx, cy + s * 0.34);
    bodyG.addColorStop(0, '#60d3f5');
    bodyG.addColorStop(0.55, '#2b9fd6');
    bodyG.addColorStop(1, '#1565a0');
    ctx.fillStyle = bodyG;
    ctx.strokeStyle = INK;
    ctx.lineWidth = lw;
    rr(ctx, cx - s * 0.21, cy + s * 0.02, s * 0.42, s * 0.31, s * 0.14);
    ctx.fill();
    ctx.stroke();

    // overall straps
    ctx.strokeStyle = 'rgba(20, 83, 145, 0.85)';
    ctx.lineWidth = Math.max(1, s * 0.026);
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + dir * s * 0.09, cy + s * 0.04);
      ctx.lineTo(cx + dir * s * 0.045, cy + s * 0.19);
      ctx.stroke();
    }

    // boots
    ctx.fillStyle = '#7c4a1e';
    for (const dir of [-1, 1]) {
      rr(ctx, cx + dir * s * 0.12 - s * 0.065, cy + s * 0.27, s * 0.13, s * 0.075, s * 0.035);
      ctx.fill();
      ctx.stroke();
    }

    // head
    const headR = s * 0.195;
    const headY = cy - s * 0.11;
    const headG = ctx.createRadialGradient(cx - headR * 0.35, headY - headR * 0.4, headR * 0.2, cx, headY, headR * 1.2);
    headG.addColorStop(0, '#ffeada');
    headG.addColorStop(0.7, '#fcd9b6');
    headG.addColorStop(1, '#edb98c');
    ctx.fillStyle = headG;
    ctx.strokeStyle = INK;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(cx, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // hat brim + crown
    const brimG = ctx.createLinearGradient(cx, headY - headR * 1.7, cx, headY - headR * 0.7);
    brimG.addColorStop(0, '#d9a94f');
    brimG.addColorStop(1, '#a4711f');
    ctx.fillStyle = brimG;
    ctx.strokeStyle = INK;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.ellipse(cx, headY - headR * 0.82, headR * 1.42, headR * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const crownG = ctx.createLinearGradient(cx, headY - headR * 1.9, cx, headY - headR * 0.75);
    crownG.addColorStop(0, '#f0c778');
    crownG.addColorStop(1, '#c08f36');
    ctx.fillStyle = crownG;
    ctx.beginPath();
    ctx.arc(cx, headY - headR * 0.9, headR * 0.82, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(92, 58, 12, 0.72)';
    ctx.lineWidth = Math.max(1, s * 0.024);
    ctx.beginPath();
    ctx.arc(cx, headY - headR * 0.9, headR * 0.82, Math.PI * 0.95, Math.PI * 1.55);
    ctx.stroke();

    // eyes + cheeks + smile
    const eyeR = Math.max(1.1, s * 0.038);
    eye(ctx, cx - headR * 0.42, headY - headR * 0.02, eyeR);
    eye(ctx, cx + headR * 0.42, headY - headR * 0.02, eyeR);
    cheeks(ctx, cx, headY + headR * 0.36, headR * 0.66, headR * 0.16, 'rgba(248, 113, 133, 0.4)');
    ctx.strokeStyle = 'rgba(30, 27, 24, 0.65)';
    ctx.lineWidth = Math.max(0.9, s * 0.016);
    ctx.beginPath();
    ctx.arc(cx, headY + headR * 0.28, headR * 0.24, 0.4, Math.PI - 0.4);
    ctx.stroke();

    rimLight(ctx, cx, headY, headR, Math.PI * 1.1, Math.PI * 1.5, Math.max(0.9, s * 0.02));
    ctx.restore();
  }

  return { floor, fence, nest, dragon, explorer };
})();
