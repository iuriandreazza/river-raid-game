import { DASHBOARD_HEIGHT, LOW_FUEL_THRESHOLD, PLAYFIELD_HEIGHT, SCREEN_WIDTH } from '../../../shared/game/constants.ts';
import type { GameState } from '../../../shared/game/types.ts';
import { COLORS } from './palette.ts';
import { drawCenteredText, drawText } from './pixelFont.ts';

const DASHBOARD_TOP = PLAYFIELD_HEIGHT;
const SCORE_Y = DASHBOARD_TOP + 3;
const SCORE_SCALE = 2;

const GAUGE = { x: 60, y: DASHBOARD_TOP + 14, width: 40, height: 11 } as const;
const POINTER_WIDTH = 3;
const BOTTOM_ROW_Y = DASHBOARD_TOP + 27;
/** The pointer blinks this often (in ticks) while the tank is nearly empty. */
const ALERT_BLINK_TICKS = 8;

export function drawDashboard(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = COLORS.dashboard;
  ctx.fillRect(0, DASHBOARD_TOP, SCREEN_WIDTH, DASHBOARD_HEIGHT);
  ctx.fillStyle = COLORS.dashboardEdge;
  ctx.fillRect(0, DASHBOARD_TOP, SCREEN_WIDTH, 1);

  drawCenteredText(ctx, String(state.score), SCREEN_WIDTH / 2, SCORE_Y, COLORS.hudText, SCORE_SCALE);
  drawFuelGauge(ctx, state);
  drawText(ctx, `JETS ${state.reserveJets}`, 8, BOTTOM_ROW_Y, COLORS.hudText);
  drawCenteredText(ctx, 'RIVER RAID', SCREEN_WIDTH / 2 + 16, BOTTOM_ROW_Y, COLORS.hudText);
}

function drawFuelGauge(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = COLORS.gaugeFrame;
  ctx.fillRect(GAUGE.x, GAUGE.y, GAUGE.width, GAUGE.height);
  ctx.fillStyle = COLORS.gaugeInside;
  ctx.fillRect(GAUGE.x + 1, GAUGE.y + 1, GAUGE.width - 2, GAUGE.height - 2);

  const markY = GAUGE.y + 3;
  drawText(ctx, 'E', GAUGE.x + 3, markY, COLORS.gaugeMark);
  drawText(ctx, 'F', GAUGE.x + GAUGE.width - 6, markY, COLORS.gaugeMark);
  ctx.fillStyle = COLORS.gaugeMark;
  ctx.fillRect(GAUGE.x + GAUGE.width / 2, GAUGE.y + 1, 1, GAUGE.height - 2);

  const alerting = state.fuel < LOW_FUEL_THRESHOLD && Math.floor(state.tick / ALERT_BLINK_TICKS) % 2 === 0;
  const travel = GAUGE.width - 2 - POINTER_WIDTH;
  ctx.fillStyle = alerting ? COLORS.hudAlert : COLORS.jetYellow;
  ctx.fillRect(GAUGE.x + 1 + Math.round(state.fuel * travel), GAUGE.y + 1, POINTER_WIDTH, GAUGE.height - 2);
}
