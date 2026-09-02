import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import Headers from "./components/headers";
import StatusBar from "./components/statusBar";
import { InputBar } from "./components/inputBar";

function App() {
  return (
    <box
      alignItems="center"
      justifyContent="center"
      backgroundColor="#0D0D12"
      width="100%"
      height="100%"
      gap={2}
    >
      <Headers />
      <box width="100%" maxWidth={78} paddingX={2}>
        <InputBar onSubmit={() => {}} />
      </box>
    </box>
  );
}

const renderer = await createCliRenderer({
  targetFps: 60,
  exitOnCtrlC: false,
});
createRoot(renderer).render(<App />);
