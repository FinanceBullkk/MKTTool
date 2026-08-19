import { describe, expect, it } from "vitest";
import {
  calculateCubicBezierPoint,
  generateBezierMouseTrajectory,
  randomGaussian,
} from "./bezier-curve";
import { generateMomentumScroll } from "./momentum-scroller";
import {
  convertTextToTelexKeystrokes,
  generateNaturalTypingPlan,
  calculateFlightTime,
} from "./telex-typing";

describe("Warmup Human Physics & Biometrics", () => {
  describe("Bézier Mouse Trajectory", () => {
    it("generates smooth trajectory from start to target", () => {
      const start = { x: 100, y: 100 };
      const target = { x: 500, y: 400 };

      const trajectory = generateBezierMouseTrajectory(start, target);

      expect(trajectory.length).toBeGreaterThan(10);
      expect(trajectory[0].x).toBeCloseTo(100, 0);
      expect(trajectory[0].y).toBeCloseTo(100, 0);
      // Điểm cuối cùng phải khớp hoàn toàn với target
      const lastPoint = trajectory[trajectory.length - 1];
      expect(lastPoint.x).toBe(target.x);
      expect(lastPoint.y).toBe(target.y);
    });

    it("calculates accurate cubic bezier points", () => {
      const p0 = { x: 0, y: 0 };
      const p1 = { x: 0, y: 100 };
      const p2 = { x: 100, y: 100 };
      const p3 = { x: 100, y: 0 };

      const midpoint = calculateCubicBezierPoint(p0, p1, p2, p3, 0.5);
      expect(midpoint.x).toBe(50);
      expect(midpoint.y).toBe(75);
    });
  });

  describe("Momentum Scrolling", () => {
    it("generates frame steps whose sum approximates target distance", () => {
      const targetDistance = 750;
      const steps = generateMomentumScroll(targetDistance, { intensity: "normal" });

      expect(steps.length).toBeGreaterThan(15);
      const totalDelta = steps.reduce((sum, s) => sum + s.deltaY, 0);
      expect(Math.abs(totalDelta - targetDistance)).toBeLessThan(1.0);
    });

    it("handles reverse direction for upward scrolling", () => {
      const targetDistance = 500;
      const steps = generateMomentumScroll(targetDistance, { direction: "up" });

      const totalDelta = steps.reduce((sum, s) => sum + s.deltaY, 0);
      expect(totalDelta).toBeLessThan(0);
      expect(Math.abs(totalDelta + targetDistance)).toBeLessThan(1.0);
    });
  });

  describe("Telex Vietnamese Typing", () => {
    it("converts accented Vietnamese characters to Telex keystrokes", () => {
      const text = "Xin chào Việt Nam tươi đẹp";
      const keys = convertTextToTelexKeystrokes(text);

      expect(keys).toContain("f"); // Dấu huyền của 'chào'
      expect(keys).toContain("j"); // Dấu nặng của 'Việt', 'đẹp'
      expect(keys).toContain("w"); // Ký tự 'ơ'/'ư' trong 'tươi'
    });

    it("generates a sequence of keydown and keyup actions with positive delays", () => {
      const text = "mkt";
      const plan = generateNaturalTypingPlan(text, { typoRate: 0 });

      expect(plan.length).toBe(6); // 3 chars * 2 (down + up)
      for (const action of plan) {
        expect(action.delayBeforeMs).toBeGreaterThan(0);
      }
    });

    it("calculates realistic flight times based on keyboard distance", () => {
      const shortFlight = calculateFlightTime("a", "s");
      const longFlight = calculateFlightTime("a", "p");

      expect(longFlight).toBeGreaterThanOrEqual(shortFlight - 30); // Khoảng cách xa có xu hướng thời gian bay dài hơn
    });
  });
});
