# Embervale: Song of the Waking Shrine

An original low-poly 3D action-adventure for the browser (and later desktop/Steam), built
entirely from code: every model is made of primitive shapes and every sound is synthesized.

```sh
npm install
npm run dev      # play at http://localhost:5173 (add ?debug for the dev overlay)
npm run check    # lint + unit tests + typecheck/build
npm run smoke    # headless playthrough of the current quest (needs Google Chrome)
```

## Controls

| | Keyboard / mouse | Gamepad |
|---|---|---|
| Move · camera | WASD · mouse (click to capture) or arrow keys | left stick · right stick |
| Sword · shield | Click or J · Shift or right-click | X · RT |
| Jump | Space | A |
| Lock on / center camera | Q | LT |
| Talk, open, read | E | A |
| Flute (then notes) | F (1–5) | Y (A ↓ → ← ↑) |
| Music on/off | P | Back |

Project context, architecture, conventions and roadmap: see [AGENTS.md](AGENTS.md).
