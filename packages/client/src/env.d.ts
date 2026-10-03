interface ImportMetaEnv {
  /** `1` for static hosting builds (GitHub Pages): no game server next to the page. */
  readonly VITE_STATIC?: string;
  /** Optional remote game server for static builds, e.g. `wss://my-game.example.com/ws`. */
  readonly VITE_SERVER_URL?: string;
}
